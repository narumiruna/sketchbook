import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { readFile, realpath, stat } from "node:fs/promises"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { isIPv4, type Socket } from "node:net"
import { networkInterfaces } from "node:os"
import { extname, isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { validateDocumentId } from "./document.js"
import { RetiredMermaidError } from "./retired-format.js"
import type { DocumentStore } from "./store.js"

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
}

function contained(root: string, path: string): boolean {
  const part = relative(root, path)
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}

function missing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  )
}

function reply(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" })
  response.end(text)
}

function privateIPv4(host: string): boolean {
  const [first, second] = host.split(".").map(Number)
  return (
    isIPv4(host) &&
    (first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168))
  )
}

function viewerHosts(): string[] {
  const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal && privateIPv4(entry.address))
      .map((entry) => entry.address),
  )
  return [...new Set([...addresses, "127.0.0.1"])]
}

/** One session-scoped, read-only viewer. A closed instance cannot restart. */
export class ViewerServer {
  private server?: Server
  private starting?: Promise<void>
  private closing?: Promise<void>
  private closed = false
  private failure?: Error
  private origin = ""
  private readonly origins = new Set<string>()
  private assetsRoot = ""
  private readonly token = randomBytes(32).toString("base64url")
  private readonly sockets = new Set<Socket>()

  constructor(
    private readonly store: DocumentStore,
    private readonly assets: string | URL = new URL("./web/", import.meta.url),
    private readonly listenHost: "0.0.0.0" | "127.0.0.1" = "0.0.0.0",
  ) {}

  async open(documentId: string, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted()
    this.assertOpen()
    validateDocumentId(documentId)
    await this.store.readViewer(documentId, signal)
    signal?.throwIfAborted()
    this.assertOpen()
    this.starting ??= this.start()
    await this.starting
    signal?.throwIfAborted()
    this.assertOpen()
    return `${this.origin}/?documentId=${encodeURIComponent(documentId)}#token=${this.token}`
  }

  close(): Promise<void> {
    this.closed = true
    this.closing ??= this.stop()
    return this.closing
  }

  private assertOpen(): void {
    if (this.closed)
      throw new Error("Sketchbook viewer is closed. Open it from the current session.")
    if (this.failure) throw this.failure
  }

  private async start(): Promise<void> {
    try {
      this.assetsRoot = await realpath(
        this.assets instanceof URL ? fileURLToPath(this.assets) : this.assets,
      )
      const index = await realpath(resolve(this.assetsRoot, "index.html"))
      if (!contained(this.assetsRoot, index) || !(await stat(index)).isFile()) {
        throw new Error("Sketchbook viewer index is not a regular bundled file.")
      }
      this.assertOpen()
      const hosts = this.listenHost === "127.0.0.1" ? [this.listenHost] : viewerHosts()
      const server = createServer((request, response) => {
        void this.handle(request, response).catch(() => {
          if (response.destroyed) return
          if (response.headersSent) response.destroy()
          else reply(response, 500, "Sketchbook request failed.")
        })
      })
      this.server = server
      server.requestTimeout = 10_000
      server.headersTimeout = 10_000
      server.keepAliveTimeout = 5_000
      server.on("connection", (socket) => {
        this.sockets.add(socket)
        socket.once("close", () => this.sockets.delete(socket))
        if (this.closed) socket.destroy()
      })
      await new Promise<void>((accept, reject) => {
        const onError = (error: Error) => reject(error)
        server.once("error", onError)
        server.listen(0, this.listenHost, () => {
          server.off("error", onError)
          server.on("error", (error) => {
            this.failure = error
            for (const socket of this.sockets) socket.destroy()
          })
          const address = server.address()
          if (!address || typeof address === "string") {
            reject(new Error("Sketchbook viewer did not acquire a listening port."))
            return
          }
          for (const host of hosts) this.origins.add(`http://${host}:${address.port}`)
          this.origin = `http://${hosts[0]}:${address.port}`
          accept()
        })
      })
    } catch (error) {
      this.failure = error instanceof Error ? error : new Error("Sketchbook viewer startup failed.")
      throw this.failure
    }
  }

  private async stop(): Promise<void> {
    if (this.starting) {
      try {
        await this.starting
      } catch {}
    }
    const server = this.server
    if (!server) return
    const stopped = new Promise<void>((accept, reject) => {
      server.close((error) => {
        if (error && (!("code" in error) || error.code !== "ERR_SERVER_NOT_RUNNING")) reject(error)
        else accept()
      })
    })
    for (const socket of this.sockets) socket.destroy()
    server.closeIdleConnections()
    await stopped
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' blob:",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
    )
    response.setHeader("Referrer-Policy", "no-referrer")
    response.setHeader("X-Content-Type-Options", "nosniff")
    response.setHeader("X-Frame-Options", "DENY")
    response.setHeader("Cache-Control", "no-store")
    const origin = `http://${request.headers.host}`
    if (
      !this.origins.has(origin) ||
      (request.headers.origin !== undefined && request.headers.origin !== origin)
    ) {
      reply(response, 403, "Forbidden.")
      return
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD")
      reply(response, 405, "Read-only viewer.")
      return
    }
    const raw = request.url ?? ""
    let path: string
    try {
      if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("#")) throw new Error()
      path = decodeURIComponent(raw.split("?")[0])
      if (
        path.includes("\\") ||
        path.includes("\0") ||
        path.split("/").some((part) => part === "." || part === "..")
      )
        throw new Error()
    } catch {
      reply(response, 400, "Invalid request path.")
      return
    }
    const controller = new AbortController()
    const abort = () => controller.abort()
    response.once("close", abort)
    try {
      if (path.startsWith("/api/")) {
        await this.document(request, response, path, controller.signal)
      } else {
        await this.asset(request, response, path, controller.signal)
      }
    } finally {
      response.off("close", abort)
    }
  }

  private async document(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    signal: AbortSignal,
  ): Promise<void> {
    const supplied = Buffer.from(request.headers.authorization ?? "")
    const expected = Buffer.from(`Bearer ${this.token}`)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      reply(response, 401, "Unauthorized.")
      return
    }
    const match = /^\/api\/documents\/([^/]+)$/.exec(path)
    if (!match) {
      reply(response, 404, "Not found.")
      return
    }
    const id = match[1]
    try {
      validateDocumentId(id)
    } catch {
      reply(response, 400, "Invalid document ID.")
      return
    }
    let stored: Awaited<ReturnType<DocumentStore["readViewer"]>>
    try {
      stored = await this.store.readViewer(id, signal)
    } catch (error) {
      if (error instanceof RetiredMermaidError) {
        reply(response, 422, error.message)
        return
      }
      if (!missing(error)) throw error
      reply(response, 404, "Document not found.")
      return
    }
    signal.throwIfAborted()
    const body = JSON.stringify(stored)
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`
    response.setHeader("ETag", etag)
    const conditional = request.headers["if-none-match"]
    if (
      conditional
        ?.split(",")
        .some((tag) => tag.trim().replace(/^W\//, "") === etag || tag.trim() === "*")
    ) {
      response.writeHead(304)
      response.end()
      return
    }
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
    })
    response.end(request.method === "HEAD" ? undefined : body)
  }

  private async asset(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    signal: AbortSignal,
  ): Promise<void> {
    const filename = path === "/" ? "index.html" : path.slice(1)
    const type = MIME[extname(filename)]
    if (!type || filename.split("/").some((part) => part.startsWith("."))) {
      reply(response, 404, "Not found.")
      return
    }
    const target = resolve(this.assetsRoot, filename)
    if (!contained(this.assetsRoot, target)) {
      reply(response, 403, "Forbidden.")
      return
    }
    let body: Buffer
    try {
      const canonical = await realpath(target)
      if (!contained(this.assetsRoot, canonical)) {
        reply(response, 403, "Forbidden.")
        return
      }
      if (!(await stat(canonical)).isFile()) {
        reply(response, 404, "Not found.")
        return
      }
      body = await readFile(canonical, { signal })
    } catch (error) {
      if (!missing(error)) throw error
      reply(response, 404, "Not found.")
      return
    }
    signal.throwIfAborted()
    response.writeHead(200, { "Content-Type": type, "Content-Length": body.length })
    response.end(request.method === "HEAD" ? undefined : body)
  }
}
