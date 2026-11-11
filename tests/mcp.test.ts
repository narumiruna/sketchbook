import { once } from "node:events"
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { Server as HttpServer, request } from "node:http"
import { connect } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import {
  CallToolResultSchema,
  ErrorCode,
  isJSONRPCResultResponse,
  LATEST_PROTOCOL_VERSION,
} from "@modelcontextprotocol/sdk/types.js"
import { Check } from "typebox/value"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  DocumentIdSchema,
  type SketchbookDocument,
  type StoredDocument,
  WriteInputSchema,
} from "../src/document.js"
import { createSketchbookMcpServer } from "../src/mcp.js"
import { ViewerServer } from "../src/server.js"
import { DocumentStore } from "../src/store.js"

const document: SketchbookDocument = {
  schemaVersion: 1,
  title: "MCP fixture",
  blocks: [
    { id: "intro", type: "markdown", markdown: "Read the complete document before editing." },
    {
      id: "deck",
      type: "diagram-deck",
      title: "Overview",
      slides: [
        {
          id: "flow",
          title: "Flow",
          mermaid: "flowchart LR\nA --> B",
          explanationMarkdown: "A sends data to B.",
        },
      ],
    },
  ],
}
const missingId = "00000000-0000-4000-8000-000000000000"

type ToolResult = Awaited<ReturnType<Client["callTool"]>>
interface Written {
  ok: true
  documentId: string
  revision: number
  path: string
  blocks: Array<{ id: string; type: string; slides?: number }>
  renderingVerified: false
}
interface Read {
  ok: true
  stored: StoredDocument
  path: string
  contentTruncated: boolean
}
interface Opened {
  ok: true
  documentId: string
  url: string
  renderingVerified: false
}

function text(result: ToolResult): string {
  const { content } = CallToolResultSchema.parse(result)
  expect(content).toHaveLength(1)
  const part = content[0]
  if (part.type !== "text") throw new Error("MCP tool results must contain JSON text")
  return part.text
}

function data<T>(result: ToolResult): T {
  expect(result.structuredContent).toBeDefined()
  const source = text(result)
  expect(source).toBe(JSON.stringify(result.structuredContent))
  expect(JSON.parse(source)).toEqual(result.structuredContent)
  return result.structuredContent as T
}

function failure(result: ToolResult, message?: RegExp): void {
  const output = data<{ ok: false; error: string }>(result)
  expect(result.isError).toBe(true)
  expect(output.ok).toBe(false)
  expect(output.error).toEqual(expect.any(String))
  expect(output.error.length).toBeGreaterThan(0)
  expect(output.error.length).toBeLessThanOrEqual(2000)
  expect(JSON.stringify(result)).not.toContain("http://")
  if (message) expect(output.error).toMatch(message)
}

async function snapshot(directory: string): Promise<unknown[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  return Promise.all(
    entries.map(async (entry) => [
      entry.name,
      entry.isDirectory()
        ? await snapshot(join(directory, entry.name))
        : await readFile(join(directory, entry.name), "utf8"),
    ]),
  )
}

// Use loopback even when the capability URL advertises a private LAN address.
function get(url: URL, path: string, authorization?: string, method = "GET") {
  return new Promise<{ status: number; text: string }>((accept, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port: url.port,
        path,
        method,
        headers: authorization ? { Authorization: authorization } : {},
        agent: false,
        signal: AbortSignal.timeout(3000),
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk) => chunks.push(chunk))
        response.on("error", reject)
        response.on("end", () =>
          accept({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString() }),
        )
      },
    )
    req.on("error", reject)
    req.end()
  })
}

function unsafeDocument(mermaid: string): SketchbookDocument {
  return {
    ...document,
    blocks: [
      {
        id: "unsafe",
        type: "diagram-deck",
        title: "Policy fixture",
        slides: [{ id: "slide", title: "Flow", mermaid, explanationMarkdown: "Explanation." }],
      },
    ],
  }
}

describe("Sketchbook MCP protocol", () => {
  let cwd: string
  const sessions: Array<ReturnType<typeof createSketchbookMcpServer> & { client: Client }> = []

  beforeEach(async () => {
    // macOS temporary directories can contain a /var -> /private/var alias.
    cwd = await realpath(await mkdtemp(join(tmpdir(), "sketchbook-mcp-")))
  })

  afterEach(async () => {
    try {
      await Promise.all(sessions.splice(0).map((session) => session.close()))
    } finally {
      vi.restoreAllMocks()
      await rm(cwd, { recursive: true, force: true })
    }
  })

  async function session() {
    const adapter = createSketchbookMcpServer(cwd)
    const client = new Client({ name: "sketchbook-protocol-test", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    sessions.push({ ...adapter, client })
    await adapter.server.connect(serverTransport)
    await client.connect(clientTransport)
    // The official client compiles output schemas and validates subsequent tool results.
    const catalog = await client.listTools()
    return { ...adapter, client, catalog }
  }

  async function write(client: Client, input = document): Promise<Written> {
    const result = await client.callTool({
      name: "sketchbook_write",
      arguments: { document: input },
    })
    expect(result.isError).not.toBe(true)
    const output = data<Written>(result)
    expect(output.ok).toBe(true)
    return output
  }

  async function read(client: Client, documentId: string): Promise<Read> {
    const result = await client.callTool({ name: "sketchbook_read", arguments: { documentId } })
    expect(result.isError).not.toBe(true)
    const output = data<Read>(result)
    expect(output.ok).toBe(true)
    return output
  }

  async function open(client: Client, documentId: string): Promise<Opened> {
    const result = await client.callTool({ name: "sketchbook_open", arguments: { documentId } })
    expect(result.isError).not.toBe(true)
    const output = data<Opened>(result)
    expect(output.ok).toBe(true)
    return output
  }

  it("initializes and lists exactly three object-root tools without files or listeners", async () => {
    const listen = vi.spyOn(HttpServer.prototype, "listen")
    const storeWrite = vi.spyOn(DocumentStore.prototype, "write")
    const storeRead = vi.spyOn(DocumentStore.prototype, "read")
    const { client, catalog, close } = await session()
    expect(client.getServerVersion()).toEqual({ name: "sketchbook", version: expect.any(String) })
    expect(client.getServerCapabilities()).toEqual({ tools: {} })
    expect(catalog.tools.map((tool) => tool.name)).toEqual([
      "sketchbook_write",
      "sketchbook_read",
      "sketchbook_open",
    ])
    for (const tool of catalog.tools) {
      expect(tool.title).toEqual(expect.any(String))
      expect(tool.description).toEqual(expect.any(String))
      expect(tool.inputSchema.type).toBe("object")
      expect(tool.inputSchema.additionalProperties).toBe(false)
      expect(tool.outputSchema?.type).toBe("object")
      expect(tool.outputSchema?.anyOf).toHaveLength(2)
      expect(tool.annotations).toEqual({
        readOnlyHint: tool.name !== "sketchbook_write",
        openWorldHint: false,
      })
    }
    expect(catalog.tools[0].inputSchema).toEqual(WriteInputSchema)
    for (const tool of catalog.tools.slice(1)) {
      expect(tool.inputSchema.properties).toEqual({ documentId: DocumentIdSchema })
      expect(tool.inputSchema.required).toEqual(["documentId"])
    }
    expect(catalog.tools[0].description).toContain(".pi/sketchbook/*.json")
    expect(catalog.tools[0].description).toContain("never changes the workspace root .gitignore")
    expect(catalog.tools[1].description).toContain("complete stored document")
    expect(catalog.tools[2].description).toContain("trusted networks")
    const instructions = client.getInstructions()
    for (const text of [
      "Only flowchart diagrams are supported",
      "Do not use Mermaid directives, frontmatter, HTML, images, icons, click actions, or node metadata",
      "Create documents without documentId or expectedRevision",
      "Read before updates",
      "current expectedRevision",
      "On conflict, read again",
      "Saving does not verify rendering",
      "private capabilities",
      "expire when this server stops",
      "Do not write the same document from different processes",
    ]) {
      expect(instructions).toContain(text)
    }
    expect(storeWrite).not.toHaveBeenCalled()
    expect(storeRead).not.toHaveBeenCalled()
    expect(listen).not.toHaveBeenCalled()
    expect(await readdir(cwd)).toEqual([])
    const closing = close()
    expect(close()).toBe(closing)
    await closing
    expect(await readdir(cwd)).toEqual([])
    expect(listen).not.toHaveBeenCalled()
  })

  it("creates, reads, replaces, and rejects revision conflicts without opening a viewer", async () => {
    const listen = vi.spyOn(HttpServer.prototype, "listen")
    await writeFile(join(cwd, ".gitignore"), "workspace-rule\n")
    const { client } = await session()
    const written = await write(client)
    expect(written).toMatchObject({
      revision: 1,
      renderingVerified: false,
      blocks: [
        { id: "intro", type: "markdown" },
        { id: "deck", type: "diagram-deck", slides: 1 },
      ],
    })
    expect(Check(DocumentIdSchema, written.documentId)).toBe(true)
    expect(written.path).toBe(join(cwd, ".pi/sketchbook", `${written.documentId}.json`))
    const initial = await read(client, written.documentId)
    expect(initial).toMatchObject({ path: written.path, contentTruncated: false })
    expect(initial.stored).toMatchObject({
      documentId: written.documentId,
      revision: 1,
      document,
    })
    expect(Number.isNaN(Date.parse(initial.stored.updatedAt))).toBe(false)
    expect(JSON.parse(await readFile(written.path, "utf8"))).toEqual(initial.stored)
    expect(await readFile(join(cwd, ".gitignore"), "utf8")).toBe("workspace-rule\n")
    expect(await readFile(join(cwd, ".pi/sketchbook/.gitignore"), "utf8")).toBe("*\n")

    const replacement: SketchbookDocument = {
      schemaVersion: 1,
      title: "Replacement",
      blocks: [{ id: "new", type: "markdown", markdown: "This replaces all previous blocks." }],
    }
    const updated = await client.callTool({
      name: "sketchbook_write",
      arguments: { document: replacement, documentId: written.documentId, expectedRevision: 1 },
    })
    expect(updated.isError).not.toBe(true)
    expect(data<Written>(updated)).toMatchObject({
      ok: true,
      documentId: written.documentId,
      revision: 2,
      path: written.path,
      blocks: [{ id: "new", type: "markdown" }],
      renderingVerified: false,
    })
    const beforeConflict = await snapshot(cwd)
    failure(
      await client.callTool({
        name: "sketchbook_write",
        arguments: { document, documentId: written.documentId, expectedRevision: 1 },
      }),
      /revision conflict.*expected 1, current 2.*sketchbook_read/i,
    )
    expect(await snapshot(cwd)).toEqual(beforeConflict)
    const current = await read(client, written.documentId)
    expect(current.stored.revision).toBe(2)
    expect(current.stored.document).toEqual(replacement)
    expect(listen).not.toHaveBeenCalled()
  })

  it("reports missing documents and invalid update pairs as domain errors with no storage changes", async () => {
    const listen = vi.spyOn(HttpServer.prototype, "listen")
    const { client } = await session()
    const written = await write(client)
    const before = await snapshot(cwd)
    for (const name of ["sketchbook_read", "sketchbook_open"]) {
      failure(await client.callTool({ name, arguments: { documentId: missingId } }), /ENOENT/)
      expect(await snapshot(cwd)).toEqual(before)
    }
    for (const arguments_ of [
      { document, documentId: written.documentId },
      { document, expectedRevision: 1 },
      { document, documentId: missingId, expectedRevision: 1 },
    ]) {
      failure(await client.callTool({ name: "sketchbook_write", arguments: arguments_ }))
      expect(await snapshot(cwd)).toEqual(before)
    }
    expect((await read(client, written.documentId)).stored.revision).toBe(1)
    expect(listen).not.toHaveBeenCalled()
  })

  it.each(["empty", "saved"])(
    "rejects missing, invalid, and extra input in an %s workspace without storage changes",
    async (state) => {
      const listen = vi.spyOn(HttpServer.prototype, "listen")
      const { client } = await session()
      const documentId = state === "saved" ? (await write(client)).documentId : missingId
      const before = await snapshot(cwd)
      const invalid: Array<{ name: string; arguments?: Record<string, unknown> }> = [
        { name: "sketchbook_write" },
        { name: "sketchbook_write", arguments: {} },
        { name: "sketchbook_write", arguments: { document: null } },
        { name: "sketchbook_write", arguments: { document: { ...document, schemaVersion: 2 } } },
        { name: "sketchbook_write", arguments: { document, extra: true } },
        {
          name: "sketchbook_write",
          arguments: { document: { ...document, extra: true } },
        },
        {
          name: "sketchbook_write",
          arguments: { document, documentId, expectedRevision: 0 },
        },
        {
          name: "sketchbook_write",
          arguments: { document, documentId, expectedRevision: "1" },
        },
        {
          name: "sketchbook_write",
          arguments: { document, documentId: "../outside", expectedRevision: 1 },
        },
      ]
      for (const name of ["sketchbook_read", "sketchbook_open"]) {
        invalid.push(
          { name },
          { name, arguments: {} },
          { name, arguments: { documentId: 1 } },
          { name, arguments: { documentId: "../outside" } },
          { name, arguments: { documentId, host: "127.0.0.1" } },
        )
      }
      for (const input of invalid) {
        failure(await client.callTool(input), /invalid sketchbook data/i)
        expect(await snapshot(cwd)).toEqual(before)
      }
      expect(listen).not.toHaveBeenCalled()
    },
  )

  it.each(["empty", "saved"])(
    "rejects Mermaid policy violations in an %s workspace without storage changes",
    async (state) => {
      const { client } = await session()
      const written = state === "saved" ? await write(client) : undefined
      const before = await snapshot(cwd)
      for (const mermaid of [
        "sequenceDiagram\nA->>B: Message",
        '%%{init: {"theme": "dark"}}%%\nflowchart LR\nA --> B',
        "---\ntitle: Configuration\n---\nflowchart LR\nA --> B",
        'flowchart LR\nA["<b>HTML</b>"] --> B',
        'flowchart LR\nA --> B\nclick A "https://example.com"',
        'flowchart LR\nA["![image](image.png)"] --> B',
        'flowchart LR\nA@{ shape: rect, label: "Metadata" } --> B',
        "flowchart LR\nA[fa:fa-user] --> B",
      ]) {
        failure(
          await client.callTool({
            name: "sketchbook_write",
            arguments: {
              document: unsafeDocument(mermaid),
              ...(written ? { documentId: written.documentId, expectedRevision: 1 } : {}),
            },
          }),
          /only flowchart|not (?:permitted|supported)/i,
        )
        expect(await snapshot(cwd)).toEqual(before)
      }
      if (written)
        expect((await read(client, written.documentId)).stored.document).toEqual(document)
    },
  )

  it("returns a protocol error for unknown tools, not an isError tool result", async () => {
    const { client } = await session()
    const before = await snapshot(cwd)
    await expect(client.callTool({ name: "unknown_tool", arguments: {} })).rejects.toMatchObject({
      code: ErrorCode.InvalidParams,
      message: expect.stringMatching(/unknown sketchbook tool/i),
    })
    expect(await snapshot(cwd)).toEqual(before)
  })

  it("returns the complete large document in JSON text and structuredContent, not the Pi text preview", async () => {
    const { client } = await session()
    const large: SketchbookDocument = {
      ...document,
      blocks: [
        { id: "large", type: "markdown", markdown: "界🧭 Complete source line.\n".repeat(5000) },
      ],
    }
    const written = await write(client, large)
    const result = await client.callTool({
      name: "sketchbook_read",
      arguments: { documentId: written.documentId },
    })
    expect(result.isError).not.toBe(true)
    const output = data<Read>(result)
    expect(output.ok).toBe(true)
    expect(output.contentTruncated).toBe(false)
    expect(output.path).toBe(written.path)
    expect(output.stored.document).toEqual(large)
    expect(output.stored).toEqual(JSON.parse(await readFile(written.path, "utf8")))
    expect(Buffer.byteLength(text(result))).toBeGreaterThan(48_000)
    expect(text(result)).not.toContain("[Content truncated")
    expect(text(result)).not.toContain("�")
  })

  it("opens a real authenticated read-only viewer and invalidates access on close", async () => {
    const listen = vi.spyOn(HttpServer.prototype, "listen")
    const { client, close } = await session()
    const written = await write(client)
    const stored = (await read(client, written.documentId)).stored
    expect(listen).not.toHaveBeenCalled()
    const opened = await open(client, written.documentId)
    expect(opened).toMatchObject({ documentId: written.documentId, renderingVerified: false })
    const url = new URL(opened.url)
    expect(url.protocol).toBe("http:")
    expect(url.searchParams.get("documentId")).toBe(written.documentId)
    expect(url.searchParams.has("token")).toBe(false)
    expect(url.hash).toMatch(/^#token=[A-Za-z0-9_-]{43}$/)
    const token = new URLSearchParams(url.hash.slice(1)).get("token")
    const api = `/api/documents/${written.documentId}`
    const auth = `Bearer ${token}`
    expect((await get(url, "/")).status).toBe(200)
    expect((await get(url, api)).status).toBe(401)
    expect((await get(url, `${api}?token=${token}`)).status).toBe(401)
    expect((await get(url, api, "Bearer wrong")).status).toBe(401)
    const response = await get(url, api, auth)
    expect(response.status).toBe(200)
    expect(JSON.parse(response.text)).toEqual(stored)
    expect((await get(url, api, auth, "POST")).status).toBe(405)
    expect((await read(client, written.documentId)).stored).toEqual(stored)
    expect((await open(client, written.documentId)).url).toBe(opened.url)
    expect(listen).toHaveBeenCalledTimes(1)
    expect(listen.mock.calls[0]?.slice(0, 2)).toEqual([0, "0.0.0.0"])
    await Promise.all([close(), close()])
    await expect(get(url, api, auth)).rejects.toThrow()
    expect(listen).toHaveBeenCalledTimes(1)
  })

  it.each(["sketchbook_write", "sketchbook_read", "sketchbook_open"])(
    "propagates SDK request cancellation to the storage signal for %s",
    async (name) => {
      const listen = vi.spyOn(HttpServer.prototype, "listen")
      const { client } = await session()
      const written = await write(client)
      const before = await snapshot(cwd)
      const entered = Promise.withResolvers<AbortSignal>()
      const aborted = Promise.withResolvers<void>()
      function waitForAbort(_input: unknown, signal?: AbortSignal): Promise<never> {
        if (!signal) throw new Error("MCP storage operations must receive a signal")
        entered.resolve(signal)
        return new Promise((_accept, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted.resolve()
              reject(signal.reason)
            },
            { once: true },
          )
        })
      }
      if (name === "sketchbook_write") {
        vi.spyOn(DocumentStore.prototype, "write").mockImplementationOnce(waitForAbort)
      } else {
        vi.spyOn(DocumentStore.prototype, "read").mockImplementationOnce(waitForAbort)
      }
      const controller = new AbortController()
      const pending = client.callTool(
        {
          name,
          arguments:
            name === "sketchbook_write"
              ? { document, documentId: written.documentId, expectedRevision: 1 }
              : { documentId: written.documentId },
        },
        undefined,
        { signal: controller.signal },
      )
      const cancelled = expect(pending).rejects.toThrow(/protocol cancellation fixture/)
      const signal = await entered.promise
      expect(signal).not.toBe(controller.signal)
      expect(signal.aborted).toBe(false)
      controller.abort(new Error("protocol cancellation fixture"))
      await cancelled
      await aborted.promise
      expect(signal.aborted).toBe(true)
      expect(await snapshot(cwd)).toEqual(before)
      expect((await read(client, written.documentId)).stored.revision).toBe(1)
      expect(listen).not.toHaveBeenCalled()
    },
  )

  it.each([0, ""])(
    "cancels a pending write with request ID %j before it can commit",
    async (id) => {
      const adapter = createSketchbookMcpServer(cwd)
      const [peer, transport] = InMemoryTransport.createLinkedPair()
      const initialized = Promise.withResolvers<void>()
      const response = Promise.withResolvers<ToolResult>()
      const entered = Promise.withResolvers<AbortSignal>()
      const release = Promise.withResolvers<void>()
      const write = DocumentStore.prototype.write
      vi.spyOn(DocumentStore.prototype, "write").mockImplementationOnce(async function (
        this: DocumentStore,
        input,
        signal,
      ) {
        if (!signal) throw new Error("MCP writes must receive a cancellation signal")
        entered.resolve(signal)
        await release.promise
        return write.call(this, input, signal)
      })
      peer.onmessage = (message) => {
        if (!isJSONRPCResultResponse(message)) return
        if (message.id === 1) initialized.resolve()
        else if (message.id === id) response.resolve(CallToolResultSchema.parse(message.result))
      }
      try {
        await adapter.server.connect(transport)
        await peer.start()
        await peer.send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "cancellation-id-test", version: "1.0.0" },
          },
        })
        await initialized.promise
        await peer.send({ jsonrpc: "2.0", method: "notifications/initialized" })
        await peer.send({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: "sketchbook_write", arguments: { document } },
        })
        const signal = await entered.promise
        await peer.send({
          jsonrpc: "2.0",
          method: "notifications/cancelled",
          params: { requestId: id },
        })
        await vi.waitFor(() => expect(signal.aborted).toBe(true))
        release.resolve()
        failure(await response.promise, /cancelled/)
        expect(await readdir(cwd)).toEqual([])
      } finally {
        release.resolve()
        await adapter.close()
        await peer.close()
      }
    },
  )

  it("closes the viewer and active sockets when the MCP client disconnects", async () => {
    const listen = vi.spyOn(HttpServer.prototype, "listen")
    const { client } = await session()
    const written = await write(client)
    const opened = await open(client, written.documentId)
    const url = new URL(opened.url)
    const api = `/api/documents/${written.documentId}`
    const auth = `Bearer ${new URLSearchParams(url.hash.slice(1)).get("token")}`
    expect((await get(url, api, auth)).status).toBe(200)
    const listener = listen.mock.instances[0] as HttpServer
    const closed = once(listener, "close")
    const socket = connect(Number(url.port), "127.0.0.1")
    socket.on("error", () => {}) // Closing an incomplete request can reset the socket.
    try {
      await once(socket, "connect")
      socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${url.port}\r\n`)
      const disconnected = new Promise<void>((accept) => socket.once("close", () => accept()))
      await client.close()
      await Promise.all([closed, disconnected])
      expect(listener.listening).toBe(false)
      await expect(get(url, api, auth)).rejects.toThrow()
      expect(listen).toHaveBeenCalledTimes(1)
    } finally {
      socket.destroy()
    }
  })

  it("does not create a listener when an open finishes its storage read after close", async () => {
    const { client, close } = await session()
    const written = await write(client)
    const stored = (await read(client, written.documentId)).stored
    const before = await snapshot(cwd)
    const listen = vi.spyOn(HttpServer.prototype, "listen")
    const opening = vi.spyOn(ViewerServer.prototype, "open")
    const entered = Promise.withResolvers<AbortSignal>()
    const blocked = Promise.withResolvers<StoredDocument>()
    vi.spyOn(DocumentStore.prototype, "read").mockImplementationOnce((_id, signal) => {
      if (!signal) throw new Error("Pending viewer opens must receive a signal")
      entered.resolve(signal)
      return blocked.promise
    })
    const pending = client.callTool({
      name: "sketchbook_open",
      arguments: { documentId: written.documentId },
    })
    const disconnected = expect(pending).rejects.toMatchObject({ code: ErrorCode.ConnectionClosed })
    const signal = await entered.promise
    expect(signal.aborted).toBe(false)
    await Promise.all([close(), close()])
    await disconnected
    expect(signal.aborted).toBe(true)
    blocked.resolve(stored)
    await expect(opening.mock.results[0].value).rejects.toThrow()
    expect(listen).not.toHaveBeenCalled()
    expect(await snapshot(cwd)).toEqual(before)
  })
})
