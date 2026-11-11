import { once } from "node:events"
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { Server } from "node:http"
import { connect } from "node:net"
import { networkInterfaces, tmpdir } from "node:os"
import { join } from "node:path"
import type {
  ExtensionAPI,
  ExtensionToolContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import * as Pi from "@earendil-works/pi-coding-agent"
import { Check } from "typebox/value"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SketchbookDocument, StoredDocument } from "../src/document.js"
import extension from "../src/extension.js"
import { DocumentStore } from "../src/store.js"

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()
  return { ...original, withFileMutationQueue: vi.fn(original.withFileMutationQueue) }
})

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  networkInterfaces: vi.fn(() => ({})),
}))

const document: SketchbookDocument = {
  schemaVersion: 1,
  title: "Tool fixture",
  blocks: [
    { id: "intro", type: "markdown", markdown: "Read this document." },
    {
      id: "deck",
      type: "diagram-deck",
      title: "Overview",
      slides: [
        {
          id: "overview",
          title: "Flow",
          mermaid: "flowchart LR\nA --> B",
          explanationMarkdown: "A sends data to B.",
        },
      ],
    },
  ],
}

// The fake host records real tool definitions; it never makes a model request.
function fakeHost() {
  const tools = new Map<string, ToolDefinition>()
  type ShutdownHandler = (event: { type: "session_shutdown"; reason: string }) => Promise<void>
  const handlers = new Map<string, ShutdownHandler>()
  const pi = {
    registerTool(tool: ToolDefinition) {
      tools.set(tool.name, tool)
    },
    on(event: string, handler: ShutdownHandler) {
      handlers.set(event, handler)
    },
  } as unknown as ExtensionAPI
  extension(pi)
  return {
    tools,
    async shutdown(reason = "quit") {
      await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason })
    },
    async call(name: string, input: unknown, cwd: string, mode = "tui", signal?: AbortSignal) {
      const tool = tools.get(name)
      if (!tool) throw new Error(`Missing fake tool ${name}`)
      const result = await tool.execute("test-call", input, signal, undefined, {
        cwd,
        mode,
      } as ExtensionToolContext)
      expect(tool.outputSchema).toBeDefined()
      if (tool.outputSchema) expect(Check(tool.outputSchema, result.structuredContent)).toBe(true)
      expect(result.details).toEqual(result.structuredContent)
      return result
    },
  }
}

type Host = ReturnType<typeof fakeHost>
type ToolResult = Awaited<ReturnType<Host["call"]>>

function text(result: ToolResult): string {
  return result.content.map((part) => (part.type === "text" ? part.text : "")).join("\n")
}

function data<T>(result: ToolResult): T {
  return result.structuredContent as T
}

interface Written {
  ok: true
  documentId: string
  revision: number
  path: string
  blocks: Array<{ id: string; type: string; slides?: number }>
  renderingVerified: false
}

interface Opened {
  ok: true
  documentId: string
  url: string
  renderingVerified: false
}

interface Read {
  ok: true
  stored: StoredDocument
  path: string
  contentTruncated: boolean
}

describe("Pi Sketchbook tool registration and lifecycle", () => {
  let cwd: string
  let host: Host
  const hosts: Host[] = []

  beforeEach(async () => {
    vi.mocked(networkInterfaces).mockReset().mockReturnValue({})
    cwd = await realpath(await mkdtemp(join(tmpdir(), "sketchbook-tools-")))
    host = fakeHost()
    hosts.push(host)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(hosts.splice(0).map((item) => item.shutdown()))
    await rm(cwd, { recursive: true, force: true })
  })

  async function write(mode = "tui", input = document) {
    const result = await host.call("sketchbook_write", { document: input }, cwd, mode)
    expect(result.isError).not.toBe(true)
    return data<Written>(result)
  }

  it("factory registers exactly three typed tools and cleanup without sockets, timers, or files", async () => {
    const listen = vi.spyOn(Server.prototype, "listen")
    const interval = vi.spyOn(globalThis, "setInterval")
    const timeout = vi.spyOn(globalThis, "setTimeout")
    const fresh = fakeHost()
    hosts.push(fresh)
    expect([...fresh.tools.keys()]).toEqual([
      "sketchbook_write",
      "sketchbook_read",
      "sketchbook_open",
    ])
    expect(networkInterfaces).not.toHaveBeenCalled()
    for (const tool of fresh.tools.values()) {
      expect(tool.parameters).toHaveProperty("type", "object")
      expect(tool.outputSchema).toBeDefined()
    }
    expect(listen).not.toHaveBeenCalled()
    expect(interval).not.toHaveBeenCalled()
    expect(timeout).not.toHaveBeenCalled()
    await expect(access(join(cwd, ".pi"))).rejects.toThrow()
    await fresh.shutdown()
    expect(listen).not.toHaveBeenCalled()
  })

  it("documents exact write scope and never promises successful rendering", async () => {
    const description = host.tools.get("sketchbook_write")?.description ?? ""
    expect(description).toContain(".pi/sketchbook/*.json")
    expect(description).toContain(".pi/sketchbook/.gitignore")
    expect(description).toContain("never changes the workspace root .gitignore")
    const written = await write()
    expect(written.renderingVerified).toBe(false)
    expect(written.revision).toBe(1)
    expect(written.path).toBe(join(cwd, ".pi/sketchbook", `${written.documentId}.json`))
    expect(written.blocks).toEqual([
      { id: "intro", type: "markdown" },
      { id: "deck", type: "diagram-deck", slides: 1 },
    ])
    await expect(access(join(cwd, ".gitignore"))).rejects.toThrow()
    expect(await readFile(join(cwd, ".pi/sketchbook/.gitignore"), "utf8")).toContain("*")
  })

  it.each(["tui", "rpc", "print", "json"])(
    "writes and reads in %s mode without starting a listener",
    async (mode) => {
      const listen = vi.spyOn(Server.prototype, "listen")
      const written = await write(mode)
      const result = await host.call(
        "sketchbook_read",
        { documentId: written.documentId },
        cwd,
        mode,
      )
      const read = data<Read>(result)
      expect(read.ok).toBe(true)
      expect(read.stored.document).toEqual(document)
      expect(read.stored.revision).toBe(1)
      expect(read.contentTruncated).toBe(false)
      expect(text(result)).toContain("flowchart LR")
      expect(listen).not.toHaveBeenCalled()
    },
  )

  it("updates with CAS, reports conflicts as structured errors, and preserves the winning revision", async () => {
    const written = await write()
    const nextDocument = { ...document, title: "Updated fixture" }
    const updated = await host.call(
      "sketchbook_write",
      { document: nextDocument, documentId: written.documentId, expectedRevision: 1 },
      cwd,
    )
    expect(data<Written>(updated).revision).toBe(2)
    const conflict = await host.call(
      "sketchbook_write",
      { document, documentId: written.documentId, expectedRevision: 1 },
      cwd,
    )
    expect(conflict.isError).toBe(true)
    expect(text(conflict)).toMatch(/conflict/i)
    const read = await host.call("sketchbook_read", { documentId: written.documentId }, cwd)
    expect(data<Read>(read).stored.document).toEqual(nextDocument)
    expect(data<Read>(read).stored.revision).toBe(2)
    const invalidUpdate = await host.call(
      "sketchbook_write",
      { document, documentId: written.documentId },
      cwd,
    )
    expect(invalidUpdate.isError).toBe(true)
  })

  it("coordinates revision-checked updates with the Pi host mutation queue", async () => {
    const written = await write()
    const held = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const { withFileMutationQueue: enqueue } = await vi.importActual<
      typeof import("@earendil-works/pi-coding-agent")
    >("@earendil-works/pi-coding-agent")
    const holding = enqueue(written.path, async () => {
      entered.resolve()
      await held.promise
      const changed = { ...document, title: "Changed by the host" }
      const current = JSON.parse(await readFile(written.path, "utf8"))
      await writeFile(written.path, JSON.stringify({ ...current, revision: 2, document: changed }))
    })
    await entered.promise
    let queued = false
    vi.mocked(Pi.withFileMutationQueue).mockImplementation((path, operation) => {
      const pending = enqueue(path, operation)
      if (path === written.path) queued = true
      return pending
    })
    const reading = vi.spyOn(DocumentStore.prototype, "read")
    const fresh = fakeHost()
    hosts.push(fresh)
    const pending = fresh.call(
      "sketchbook_write",
      { document, documentId: written.documentId, expectedRevision: 1 },
      cwd,
    )
    try {
      await vi.waitFor(() => expect(queued).toBe(true))
      expect(reading).not.toHaveBeenCalled()
    } finally {
      vi.mocked(Pi.withFileMutationQueue).mockImplementation(enqueue)
      held.resolve()
      await holding
    }
    const conflict = await pending
    expect(conflict.isError).toBe(true)
    expect(text(conflict)).toContain("Revision conflict")
    expect((await new DocumentStore(cwd).read(written.documentId)).revision).toBe(2)
  })

  it.each(["tui", "rpc"])(
    "opens a real authenticated viewer in %s without claiming a rendered result",
    async (mode) => {
      const written = await write(mode)
      const result = await host.call(
        "sketchbook_open",
        { documentId: written.documentId },
        cwd,
        mode,
      )
      expect(result.isError).not.toBe(true)
      const opened = data<Opened>(result)
      const url = new URL(opened.url)
      expect(opened.renderingVerified).toBe(false)
      expect(url.hostname).toBe("127.0.0.1")
      expect(text(result)).toContain("Browser rendering is not verified")
      const response = await fetch(`${url.origin}/api/documents/${written.documentId}`, {
        headers: { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("token")}` },
      })
      expect(response.status).toBe(200)
      expect((await response.json()).document).toEqual(document)
      expect((await fetch(url.origin)).status).toBe(200)
    },
  )

  it("automatically discovers a LAN URL only on first open without a model-controlled host input", async () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      en0: [
        {
          address: "192.168.1.5",
          family: "IPv4",
          internal: false,
          netmask: "255.255.255.0",
          mac: "00:00:00:00:00:00",
          cidr: "192.168.1.5/24",
        },
      ],
    })
    const written = await write()
    expect(networkInterfaces).not.toHaveBeenCalled()
    const binding = vi.spyOn(Server.prototype, "listen")
    const first = data<Opened>(
      await host.call("sketchbook_open", { documentId: written.documentId }, cwd),
    )
    expect(first.ok).toBe(true)
    expect(new URL(first.url).hostname).toBe("192.168.1.5")
    expect(binding.mock.calls[0]?.slice(0, 2)).toEqual([0, "0.0.0.0"])
    expect(networkInterfaces).toHaveBeenCalledTimes(1)
    const schema = host.tools.get("sketchbook_open")?.parameters
    if (!schema) throw new Error("Missing open input schema")
    expect(Check(schema, { documentId: written.documentId, host: "192.168.1.5" })).toBe(false)
    expect(host.tools.get("sketchbook_open")?.description).toContain("automatically")
    const second = data<Opened>(
      await host.call("sketchbook_open", { documentId: written.documentId }, cwd),
    )
    expect(second.url).toBe(first.url)
    expect(binding).toHaveBeenCalledTimes(1)
    expect(networkInterfaces).toHaveBeenCalledTimes(1)
  })

  it("reports interface discovery failure without a URL or listener and keeps stored data readable", async () => {
    const written = await write()
    vi.mocked(networkInterfaces).mockImplementationOnce(() => {
      throw new Error("Interface discovery failed")
    })
    const listen = vi.spyOn(Server.prototype, "listen")
    const result = await host.call("sketchbook_open", { documentId: written.documentId }, cwd)
    expect(result.isError).toBe(true)
    expect(text(result)).toBe("Interface discovery failed")
    expect(JSON.stringify(result)).not.toContain("http://")
    expect(listen).not.toHaveBeenCalled()
    expect(
      data<Read>(await host.call("sketchbook_read", { documentId: written.documentId }, cwd)).stored
        .document,
    ).toEqual(document)
  })

  it.each(["print", "json", "unknown"])(
    "refuses open in %s mode without a URL or socket",
    async (mode) => {
      const written = await write()
      const listen = vi.spyOn(Server.prototype, "listen")
      const result = await host.call(
        "sketchbook_open",
        { documentId: written.documentId },
        cwd,
        mode,
      )
      expect(result.isError).toBe(true)
      expect(data<{ ok: boolean }>(result).ok).toBe(false)
      expect(text(result)).toContain("persistent tui or rpc session")
      expect(JSON.stringify(result)).not.toContain("http://")
      expect(listen).not.toHaveBeenCalled()
    },
  )

  it("reports invalid IDs, missing documents, unsafe source, and aborts through each tool's schema", async () => {
    for (const name of ["sketchbook_read", "sketchbook_open"]) {
      for (const documentId of ["../outside", "00000000-0000-4000-8000-000000000000"]) {
        const result = await host.call(name, { documentId }, cwd)
        expect(result.isError).toBe(true)
        expect(JSON.stringify(result)).not.toContain("http://")
      }
    }
    const invalid = await host.call(
      "sketchbook_write",
      { document: { ...document, schemaVersion: 2 } },
      cwd,
    )
    expect(invalid.isError).toBe(true)
    const aborted = AbortSignal.abort(new Error("Tool cancelled"))
    for (const [name, input] of [
      ["sketchbook_write", { document }],
      ["sketchbook_read", { documentId: "invalid" }],
      ["sketchbook_open", { documentId: "invalid" }],
    ] as const) {
      const result = await host.call(name, input, cwd, "tui", aborted)
      expect(result.isError).toBe(true)
      expect(text(result)).toBe("Tool cancelled")
    }
  })

  it("bounds model-facing source while retaining the complete document and its storage path", async () => {
    const large: SketchbookDocument = {
      ...document,
      blocks: [{ id: "large", type: "markdown", markdown: "A large source line.\n".repeat(5000) }],
    }
    const written = await write("tui", large)
    const result = await host.call("sketchbook_read", { documentId: written.documentId }, cwd)
    const read = data<Read>(result)
    expect(read.contentTruncated).toBe(true)
    expect(read.stored.document).toEqual(large)
    expect(text(result)).toContain("Content truncated")
    expect(text(result)).toContain(written.path)
    expect(Buffer.byteLength(text(result))).toBeLessThan(50_000)
    expect(text(result).split("\n").length).toBeLessThan(2000)
  })

  it("uses ctx.cwd lazily and keeps workspace artifacts separate", async () => {
    const first = await write()
    const other = join(cwd, "other")
    await mkdir(other)
    const second = data<Written>(await host.call("sketchbook_write", { document }, other))
    expect(second.path).toContain(join(other, ".pi/sketchbook"))
    const absent = await host.call("sketchbook_read", { documentId: first.documentId }, other)
    expect(absent.isError).toBe(true)
    const present = await host.call("sketchbook_read", { documentId: first.documentId }, cwd)
    expect(data<Read>(present).stored.document).toEqual(document)
  })

  it.each(["quit", "reload", "new", "resume", "fork"])(
    "shutdown on %s closes active sockets; a replacement factory must issue a new URL",
    async (reason) => {
      const written = await write()
      const first = data<Opened>(
        await host.call("sketchbook_open", { documentId: written.documentId }, cwd),
      )
      const url = new URL(first.url)
      const socket = connect(Number(url.port), url.hostname)
      socket.on("error", () => {}) // Shutdown can reset an incomplete HTTP request.
      await once(socket, "connect")
      socket.write(`GET / HTTP/1.1\r\nHost: ${url.host}\r\n`)
      const disconnected = new Promise<void>((accept) => socket.once("close", () => accept()))
      await Promise.all([host.shutdown(reason), host.shutdown(reason)])
      await disconnected
      await expect(fetch(url.origin)).rejects.toThrow()
      const stale = await host.call("sketchbook_open", { documentId: written.documentId }, cwd)
      expect(stale.isError).toBe(true)
      expect(JSON.stringify(stale)).not.toContain("http://")
      const replacement = fakeHost()
      hosts.push(replacement)
      const second = data<Opened>(
        await replacement.call("sketchbook_open", { documentId: written.documentId }, cwd),
      )
      expect(new URL(second.url).hash).not.toBe(url.hash)
      expect((await fetch(new URL(second.url).origin)).status).toBe(200)
      const read = await replacement.call(
        "sketchbook_read",
        { documentId: written.documentId },
        cwd,
      )
      expect(data<Read>(read).stored.revision).toBe(1)
    },
  )

  it("shutdown cancels an open pending on storage and does not leave a listener", async () => {
    const written = await write()
    const stored = await new DocumentStore(cwd).read(written.documentId)
    let release: (value: StoredDocument) => void = () => {}
    vi.spyOn(DocumentStore.prototype, "read").mockReturnValue(
      new Promise((accept) => {
        release = accept
      }),
    )
    const listen = vi.spyOn(Server.prototype, "listen")
    const pending = host.call("sketchbook_open", { documentId: written.documentId }, cwd)
    await host.shutdown("reload")
    release(stored)
    const result = await pending
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toContain("http://")
    expect(listen).not.toHaveBeenCalled()
  })
})
