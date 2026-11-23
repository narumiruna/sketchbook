import { once } from "node:events"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { type IncomingHttpHeaders, request, Server } from "node:http"
import { connect } from "node:net"
import { type NetworkInterfaceInfo, networkInterfaces, tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SketchbookDocument, StoredDocument } from "../src/document.js"
import { ViewerServer } from "../src/server.js"
import { DocumentStore } from "../src/store.js"

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  networkInterfaces: vi.fn(() => ({})),
}))

const document: SketchbookDocument = {
  schemaVersion: 1,
  title: "Server fixture",
  blocks: [{ id: "intro", type: "markdown", markdown: "Private fixture content." }],
}

interface Response {
  status: number
  headers: IncomingHttpHeaders
  text: string
}

function get(
  url: URL,
  path: string,
  headers: Record<string, string | undefined> = {},
  method = "GET",
): Promise<Response> {
  return new Promise((accept, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path,
        method,
        headers,
        agent: false,
        signal: AbortSignal.timeout(3000),
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk) => chunks.push(chunk))
        response.on("error", reject)
        response.on("end", () =>
          accept({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString(),
          }),
        )
      },
    )
    req.on("error", reject)
    req.end()
  })
}

function interfaceAddress(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    family: "IPv4",
    internal,
    netmask: "255.255.255.0",
    mac: "00:00:00:00:00:00",
    cidr: `${address}/24`,
  }
}

describe("ViewerServer", () => {
  let cwd: string
  let assets: string
  let store: DocumentStore
  let stored: StoredDocument
  let viewer: ViewerServer
  const servers: ViewerServer[] = []

  beforeEach(async () => {
    vi.mocked(networkInterfaces).mockReset().mockReturnValue({})
    cwd = await mkdtemp(join(tmpdir(), "sketchbook-server-"))
    assets = join(cwd, "viewer")
    await mkdir(join(assets, "assets"), { recursive: true })
    await writeFile(
      join(assets, "index.html"),
      '<!doctype html><script src="/assets/app.js"></script>',
    )
    await writeFile(join(assets, "assets/app.js"), 'console.log("fixture")')
    await writeFile(join(assets, "assets/app.css"), "body { color: black }")
    await writeFile(join(assets, "assets/font.woff2"), "font-fixture")
    store = new DocumentStore(cwd)
    stored = (await store.write({ document })).stored
    viewer = new ViewerServer(store, assets)
    servers.push(viewer)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(servers.splice(0).map((server) => server.close()))
    await rm(cwd, { recursive: true, force: true })
  })

  async function opened() {
    const url = new URL(await viewer.open(stored.documentId))
    const token = new URLSearchParams(url.hash.slice(1)).get("token")
    return {
      url,
      auth: { Authorization: `Bearer ${token}` },
      api: `/api/documents/${stored.documentId}`,
    }
  }

  it("is lazy, shares one concurrent listener, and puts its capability only in the fragment", async () => {
    const listen = vi.spyOn(Server.prototype, "listen")
    const unopened = new ViewerServer(store, assets)
    servers.push(unopened)
    expect(listen).not.toHaveBeenCalled()
    const urls = await Promise.all(Array.from({ length: 8 }, () => viewer.open(stored.documentId)))
    expect(new Set(urls).size).toBe(1)
    expect(listen).toHaveBeenCalledTimes(1)
    const url = new URL(urls[0])
    expect(url.hostname).toBe("127.0.0.1")
    expect(url.search).toBe(`?documentId=${stored.documentId}`)
    expect(url.hash).toMatch(/^#token=[A-Za-z0-9_-]{43}$/)
    expect(listen.mock.calls[0]?.[0]).toBe(0)
    expect(listen.mock.calls[0]?.[1]).toBe("0.0.0.0")
    expect(networkInterfaces).toHaveBeenCalledTimes(1)
  })

  it("can bind only to loopback without detecting or accepting LAN hosts", async () => {
    const lan = "192.168.1.5"
    vi.mocked(networkInterfaces).mockReturnValue({ en0: [interfaceAddress(lan)] })
    const listen = vi.spyOn(Server.prototype, "listen")
    viewer = new ViewerServer(store, assets, "127.0.0.1")
    servers.push(viewer)
    const { url, auth, api } = await opened()
    expect(url.hostname).toBe("127.0.0.1")
    expect(listen.mock.calls[0]?.[1]).toBe("127.0.0.1")
    expect(networkInterfaces).not.toHaveBeenCalled()
    expect((await get(url, api, auth)).status).toBe(200)
    expect((await get(url, api, { ...auth, Host: `${lan}:${url.port}` })).status).toBe(403)
  })

  it("publishes book content to the original authenticated endpoint with a fresh ETag", async () => {
    const { url, auth, api } = await opened()
    const before = await get(url, api, auth)
    expect(JSON.parse(before.text)).toEqual(stored)
    const chapter = { id: "api", title: "API design", blocks: [], sections: [] }
    await store.editBook({
      documentId: stored.documentId,
      expectedRevision: 0,
      operation: { type: "add-chapter", chapter },
    })
    const updated = await get(url, api, { ...auth, "If-None-Match": before.headers.etag })
    expect(updated.status).toBe(200)
    expect(updated.headers.etag).not.toBe(before.headers.etag)
    expect(JSON.parse(updated.text)).toEqual({
      ...stored,
      book: {
        documentId: stored.documentId,
        revision: 1,
        updatedAt: expect.any(String),
        sections: [],
        chapters: [chapter],
      },
    })
    expect((await get(url, api, { ...auth, "If-None-Match": updated.headers.etag })).status).toBe(
      304,
    )
    expect((await get(url, api)).status).toBe(401)
    expect((await get(url, api, auth, "POST")).status).toBe(405)
  })

  it.each(["10.0.0.5", "172.16.0.5", "172.31.255.254", "192.168.1.5"])(
    "binds to wildcard IPv4 and advertises detected private address %s",
    async (host) => {
      vi.mocked(networkInterfaces).mockReturnValue({ en0: [interfaceAddress(host)] })
      const listen = vi.spyOn(Server.prototype, "listen")
      expect(listen).not.toHaveBeenCalled()
      const url = new URL(await viewer.open(stored.documentId))
      expect(url.hostname).toBe(host)
      expect(url.hash).toMatch(/^#token=[A-Za-z0-9_-]{43}$/)
      expect(listen).toHaveBeenCalledTimes(1)
      expect(listen.mock.calls[0]?.slice(0, 2)).toEqual([0, "0.0.0.0"])
      const connection = new URL(url)
      connection.hostname = "127.0.0.1"
      expect((await get(connection, "/", { Host: url.host, Origin: url.origin })).status).toBe(200)
    },
  )

  it.each([
    "",
    "0.0.0.0",
    "::",
    "::1",
    "[::1]",
    "::ffff:192.168.1.5",
    "localhost",
    "lan.example",
    "8.8.8.8",
    "100.64.0.1",
    "169.254.1.5",
    "127.0.0.2",
    "172.15.255.255",
    "172.32.0.1",
    "192.169.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "10.1",
    "10.01.1.5",
    "10.0.0.999",
    "192.168.1.5:8080",
    "http://192.168.1.5",
    " 192.168.1.5",
  ])("does not advertise or trust unsupported interface address %j", async (host) => {
    vi.mocked(networkInterfaces).mockReturnValue({ invalid: [interfaceAddress(host)] })
    const url = new URL(await viewer.open(stored.documentId))
    expect(url.hostname).toBe("127.0.0.1")
    expect((await get(url, "/", { Host: `${host}:${url.port}` })).status).toBe(403)
  })

  it("selects the first non-internal private IPv4 address and keeps every allowed origin distinct", async () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      lo0: [interfaceAddress("127.0.0.1", true), interfaceAddress("10.0.0.1", true)],
      public: [interfaceAddress("8.8.8.8")],
      en0: [interfaceAddress("192.168.1.5")],
      en1: [interfaceAddress("10.0.0.6"), interfaceAddress("192.168.1.5")],
      ipv6: [{ ...interfaceAddress("fd00::1"), family: "IPv6", scopeid: 0 }],
      absent: undefined,
    })
    const url = new URL(await viewer.open(stored.documentId))
    expect(url.hostname).toBe("192.168.1.5")
    const connection = new URL(url)
    connection.hostname = "127.0.0.1"
    for (const address of ["127.0.0.1", "192.168.1.5", "10.0.0.6"]) {
      const host = `${address}:${url.port}`
      expect((await get(connection, "/", { Host: host, Origin: `http://${host}` })).status).toBe(
        200,
      )
      const foreign = address === "192.168.1.5" ? connection.origin : url.origin
      expect((await get(connection, "/", { Host: host, Origin: foreign })).status).toBe(403)
    }
    vi.mocked(networkInterfaces).mockReturnValue({ en0: [interfaceAddress("192.168.1.6")] })
    expect(await viewer.open(stored.documentId)).toBe(url.href)
    expect(networkInterfaces).toHaveBeenCalledTimes(1)
    expect((await get(connection, "/", { Host: `192.168.1.6:${url.port}` })).status).toBe(403)
  })

  it("uses a loopback URL with IPv6-only interfaces and never returns the wildcard address", async () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      en0: [{ ...interfaceAddress("fd00::1"), family: "IPv6", scopeid: 0 }],
    })
    const { url } = await opened()
    expect(url.hostname).toBe("127.0.0.1")
    expect((await get(url, "/")).status).toBe(200)
    expect((await get(url, "/", { Host: `0.0.0.0:${url.port}` })).status).toBe(403)
  })

  it("reports interface discovery failure without leaving a listener", async () => {
    vi.mocked(networkInterfaces).mockImplementationOnce(() => {
      throw new Error("Interface discovery failed")
    })
    const listen = vi.spyOn(Server.prototype, "listen")
    await expect(viewer.open(stored.documentId)).rejects.toThrow("Interface discovery failed")
    expect(listen).not.toHaveBeenCalled()
    await viewer.close()
  })

  it("keeps capability, exact Host/Origin, read-only, revision, and shutdown protections on LAN", async () => {
    vi.mocked(networkInterfaces).mockReturnValue({ en0: [interfaceAddress("192.168.1.5")] })
    const url = new URL(await viewer.open(stored.documentId))
    const connection = new URL(url)
    connection.hostname = "127.0.0.1"
    const api = `/api/documents/${stored.documentId}`
    const token = new URLSearchParams(url.hash.slice(1)).get("token")
    const host = { Host: url.host }
    const auth = { ...host, Authorization: `Bearer ${token}`, Origin: url.origin }
    expect((await get(connection, api, host)).status).toBe(401)
    expect((await get(connection, `${api}?token=${token}`, host)).status).toBe(401)
    expect((await get(connection, api, { ...host, Authorization: "Bearer wrong" })).status).toBe(
      401,
    )
    const first = await get(connection, api, auth)
    expect(first.status).toBe(200)
    expect(JSON.parse(first.text)).toEqual(stored)
    expect(first.headers["access-control-allow-origin"]).toBeUndefined()
    const etag = first.headers.etag
    expect((await get(connection, api, { ...auth, "If-None-Match": etag })).status).toBe(304)
    expect((await get(connection, api, { ...host, "If-None-Match": "*" })).status).toBe(401)
    for (const path of [api, "/", "/assets/app.js"]) {
      for (const headers of [
        { Host: connection.host },
        { Host: `192.168.1.6:${url.port}` },
        { Host: `192.168.1.5:${Number(url.port) + 1}` },
        { Origin: "http://192.168.1.6" },
        { Origin: "https://evil.example" },
        { Origin: "null" },
      ]) {
        const response = await get(connection, path, { ...auth, ...headers })
        expect(response.status).toBe(403)
        expect(response.headers["access-control-allow-origin"]).toBeUndefined()
      }
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect((await get(connection, api, auth, method)).status).toBe(405)
    }
    expect((await store.read(stored.documentId)).revision).toBe(1)
    await viewer.close()
    await expect(get(connection, "/", host)).rejects.toThrow()
    await expect(viewer.open(stored.documentId)).rejects.toThrow(/closed/)
  })

  it("does not retry another bind after wildcard binding fails", async () => {
    const listen = vi.spyOn(Server.prototype, "listen").mockImplementationOnce(function (
      this: Server,
    ) {
      queueMicrotask(() => this.emit("error", new Error("EADDRNOTAVAIL")))
      return this
    })
    await expect(viewer.open(stored.documentId)).rejects.toThrow("EADDRNOTAVAIL")
    await expect(viewer.open(stored.documentId)).rejects.toThrow("EADDRNOTAVAIL")
    expect(listen).toHaveBeenCalledTimes(1)
    expect(listen.mock.calls[0]?.slice(0, 2)).toEqual([0, "0.0.0.0"])
    await viewer.close()
    await viewer.close()
  })

  it("serves authenticated document JSON and conditional revisions without a body", async () => {
    const { url, auth, api } = await opened()
    const first = await get(url, api, auth)
    expect(first.status).toBe(200)
    expect(JSON.parse(first.text)).toEqual(stored)
    expect(first.headers["content-type"]).toContain("application/json")
    const etag = first.headers.etag ?? ""
    expect(etag).toMatch(/^"[a-f0-9]+"$/)
    for (const condition of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
      const same = await get(url, api, { ...auth, "If-None-Match": condition })
      expect(same.status).toBe(304)
      expect(same.text).toBe("")
    }
    const head = await get(url, api, auth, "HEAD")
    expect(head.status).toBe(200)
    expect(head.text).toBe("")
    const next = await store.write({
      document: { ...document, title: "Updated" },
      documentId: stored.documentId,
      expectedRevision: 1,
    })
    const updated = await get(url, api, { ...auth, "If-None-Match": etag })
    expect(updated.status).toBe(200)
    expect(updated.headers.etag).not.toBe(etag)
    expect(JSON.parse(updated.text)).toEqual(next.stored)
  })

  it("requires the exact bearer capability even for conditional requests", async () => {
    const { url, api } = await opened()
    for (const headers of [{}, { Authorization: "Bearer wrong" }, { "If-None-Match": "*" }]) {
      const response = await get(url, api, headers)
      expect(response.status).toBe(401)
      expect(response.text).not.toContain(document.title)
      expect(response.headers.etag).toBeUndefined()
      expect(response.headers["access-control-allow-origin"]).toBeUndefined()
    }
    expect((await get(url, `${api}?token=${url.hash.slice(7)}`)).status).toBe(401)
  })

  it("rejects untrusted Host and Origin on API and static resources", async () => {
    const { url, auth, api } = await opened()
    for (const path of [api, "/"]) {
      for (const headers of [
        { Host: "evil.example" },
        { Host: `localhost:${url.port}` },
        { Host: `127.0.0.1:${Number(url.port) + 1}` },
        { Origin: "https://evil.example" },
        { Origin: "null" },
      ]) {
        const response = await get(url, path, { ...auth, ...headers })
        expect(response.status).toBe(403)
        expect(response.headers["access-control-allow-origin"]).toBeUndefined()
      }
      expect((await get(url, path, { ...auth, Origin: url.origin })).status).toBe(200)
    }
  })

  it("allows only GET and HEAD and never offers CORS preflight", async () => {
    const { url, auth, api } = await opened()
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = await get(url, api, auth, method)
      expect(response.status).toBe(405)
      expect(response.headers.allow).toBe("GET, HEAD")
      expect(response.headers["access-control-allow-methods"]).toBeUndefined()
    }
    expect((await store.read(stored.documentId)).revision).toBe(1)
  })

  it("serves local assets with MIME types and security headers, without disclosing data or tokens", async () => {
    const { url } = await opened()
    for (const [path, type] of [
      ["/", "text/html"],
      ["/assets/app.js", "text/javascript"],
      ["/assets/app.css", "text/css"],
      ["/assets/font.woff2", "font/woff2"],
    ]) {
      const response = await get(url, path)
      expect(response.status).toBe(200)
      expect(response.headers["content-type"]).toContain(type)
      expect(response.headers["referrer-policy"]).toBe("no-referrer")
      expect(response.headers["x-content-type-options"]).toBe("nosniff")
      expect(response.headers["x-frame-options"]).toBe("DENY")
      expect(response.headers["cache-control"]).toBe("no-store")
      const csp = response.headers["content-security-policy"] ?? ""
      expect(csp).toContain("script-src 'self'")
      expect(csp).toContain("connect-src 'self'")
      expect(csp).toContain("font-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
      expect(response.text).not.toContain(url.hash.slice(7))
      expect(response.text).not.toContain(document.blocks[0].id)
    }
    const head = await get(url, "/assets/app.js", {}, "HEAD")
    expect(head.status).toBe(200)
    expect(head.text).toBe("")
    expect((await get(url, "/missing.js")).status).toBe(404)
  })

  it("rejects traversal, malformed URLs, private files, and symlinks outside the asset root", async () => {
    const { url, auth } = await opened()
    await writeFile(join(cwd, "secret.js"), "workspace secret")
    await symlink(join(cwd, "secret.js"), join(assets, "leak.js"))
    for (const path of [
      "/../secret.js",
      "/%2e%2e/secret.js",
      "/assets/%2E%2E/secret.js",
      "/assets%2f..%2f..%2fsecret.js",
      "/%5c..%5csecret.js",
      "/%00.js",
      "/%zz",
      "//evil.example/x.js",
    ]) {
      expect((await get(url, path, auth)).status).toBe(400)
    }
    for (const path of [
      "/.sketchbook/anything.json",
      "/.hidden.js",
      "/src/server.ts",
      "/assets/app.js.map",
    ]) {
      expect((await get(url, path, auth)).status).toBe(404)
    }
    expect((await get(url, "/leak.js")).status).toBe(403)
  })

  it("validates IDs, distinguishes missing data, and hides storage failure details", async () => {
    const { url, auth, api } = await opened()
    expect((await get(url, "/api/documents/not-an-id", auth)).status).toBe(400)
    expect(
      (await get(url, "/api/documents/00000000-0000-4000-8000-000000000000", auth)).status,
    ).toBe(404)
    expect((await get(url, "/api/other", auth)).status).toBe(404)
    vi.spyOn(store, "readViewer").mockRejectedValue(new Error("private filesystem failure"))
    const failed = await get(url, api, auth)
    expect(failed.status).toBe(500)
    expect(failed.text).not.toContain("private filesystem")
    await expect(viewer.open("../bad")).rejects.toThrow()
  })

  it("does not listen after invalid, missing, or pre-aborted opens", async () => {
    const listen = vi.spyOn(Server.prototype, "listen")
    await expect(viewer.open("bad")).rejects.toThrow()
    await expect(viewer.open("00000000-0000-4000-8000-000000000000")).rejects.toThrow()
    await expect(viewer.open(stored.documentId, AbortSignal.abort())).rejects.toThrow()
    expect(listen).not.toHaveBeenCalled()
  })

  it("reports unavailable assets and allows idempotent cleanup after startup failure", async () => {
    const broken = new ViewerServer(store, join(cwd, "no-build"))
    servers.push(broken)
    await expect(broken.open(stored.documentId)).rejects.toThrow()
    await broken.close()
    await broken.close()
  })

  it("closes idle and incomplete active connections and permanently invalidates its URL", async () => {
    const { url } = await opened()
    const idle = connect(Number(url.port), url.hostname)
    const active = connect(Number(url.port), url.hostname)
    await Promise.all([once(idle, "connect"), once(active, "connect")])
    active.write(`GET / HTTP/1.1\r\nHost: ${url.host}\r\n`)
    // Destroying an incomplete request can reset its client socket.
    idle.on("error", () => {})
    active.on("error", () => {})
    const disconnected = Promise.all(
      [idle, active].map(
        (socket) => new Promise<void>((accept) => socket.once("close", () => accept())),
      ),
    )
    await Promise.all([viewer.close(), viewer.close()])
    await disconnected
    await expect(get(url, "/")).rejects.toThrow()
    await expect(viewer.open(stored.documentId)).rejects.toThrow(/closed/)
  })

  it("does not start a socket when shutdown races an in-flight document read", async () => {
    let release: (stored: StoredDocument) => void = () => {}
    vi.spyOn(store, "read").mockReturnValue(
      new Promise((accept) => {
        release = accept
      }),
    )
    const listen = vi.spyOn(Server.prototype, "listen")
    const pending = viewer.open(stored.documentId)
    await viewer.close()
    release(stored)
    await expect(pending).rejects.toThrow(/closed/)
    expect(listen).not.toHaveBeenCalled()
  })

  it("closes safely while concurrent opens are starting", async () => {
    const pending = [viewer.open(stored.documentId), viewer.open(stored.documentId)]
    const settled = Promise.allSettled(pending)
    await new Promise<void>((accept) => setImmediate(accept))
    await viewer.close()
    for (const result of await settled) {
      if (result.status === "fulfilled")
        await expect(get(new URL(result.value), "/")).rejects.toThrow()
      else expect(result.reason).toBeInstanceOf(Error)
    }
  })

  it("propagates listen failures and still closes idempotently", async () => {
    vi.spyOn(Server.prototype, "listen").mockImplementationOnce(function (this: Server) {
      queueMicrotask(() => this.emit("error", new Error("Listen fixture failed")))
      return this
    })
    await expect(viewer.open(stored.documentId)).rejects.toThrow("Listen fixture failed")
    await viewer.close()
    await viewer.close()
  })

  it("preserves unexpected runtime listener errors for the next open", async () => {
    const listen = vi.spyOn(Server.prototype, "listen")
    await opened()
    const listener = listen.mock.instances[0] as Server
    listener.emit("error", new Error("Runtime fixture failed"))
    await expect(viewer.open(stored.documentId)).rejects.toThrow("Runtime fixture failed")
  })

  it("aborts an in-flight storage read when its HTTP client disconnects", async () => {
    const { url, auth, api } = await opened()
    let release: (value: StoredDocument) => void = () => {}
    let started: (signal: AbortSignal) => void = () => {}
    const reading = new Promise<AbortSignal>((accept) => {
      started = accept
    })
    vi.spyOn(store, "readViewer").mockImplementationOnce((_id, signal) => {
      if (!signal) throw new Error("HTTP reads must have an abort signal")
      started(signal)
      return new Promise((accept) => {
        release = accept
      })
    })
    const req = request({
      hostname: url.hostname,
      port: url.port,
      path: api,
      headers: auth,
      agent: false,
    })
    req.on("error", () => {})
    req.end()
    const signal = await reading
    const aborted = new Promise<void>((accept) =>
      signal.addEventListener("abort", () => accept(), { once: true }),
    )
    req.destroy()
    await aborted
    expect(signal.aborted).toBe(true)
    release(stored)
    await new Promise<void>((accept) => setImmediate(accept))
    expect((await get(url, api, auth)).status).toBe(200)
  })

  it("checks cancellation after an asynchronous store read before listening", async () => {
    const controller = new AbortController()
    const listen = vi.spyOn(Server.prototype, "listen")
    vi.spyOn(store, "readViewer").mockImplementationOnce(async () => {
      controller.abort(new Error("Open cancelled"))
      return stored
    })
    await expect(viewer.open(stored.documentId, controller.signal)).rejects.toThrow(
      "Open cancelled",
    )
    expect(listen).not.toHaveBeenCalled()
  })

  it("uses a different capability for a new server", async () => {
    const first = new URL(await viewer.open(stored.documentId))
    const next = new ViewerServer(store, assets)
    servers.push(next)
    const second = new URL(await next.open(stored.documentId))
    expect(first.hash).not.toBe(second.hash)
  })
})
