import { mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ReadBuffer } from "@modelcontextprotocol/sdk/shared/stdio.js"
import {
  CallToolResultSchema,
  isJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
  LATEST_PROTOCOL_VERSION,
  type RequestId,
} from "@modelcontextprotocol/sdk/types.js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SketchbookDocument } from "../src/document.js"
import { createSketchbookMcpServer } from "../src/mcp.js"
import { DocumentStore } from "../src/store.js"

const document: SketchbookDocument = {
  schemaVersion: 1,
  title: "Cancellation fixture",
  blocks: [{ id: "intro", type: "markdown", markdown: "This write must be cancelled." }],
}

function call(id: RequestId, arguments_: Record<string, unknown>): JSONRPCMessage {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: "sketchbook_write", arguments: arguments_ },
  }
}

function cancel(requestId: RequestId): JSONRPCMessage {
  return { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId } }
}

/** Send each batch in one stdio chunk, before the SDK runs its queued tool handlers. */
async function stdioSession(cwd: string) {
  const adapter = createSketchbookMcpServer(cwd)
  const input = new PassThrough()
  const output = new PassThrough()
  const buffer = new ReadBuffer()
  const pending = new Map<
    RequestId,
    ReturnType<typeof Promise.withResolvers<Record<string, unknown>>>
  >()
  output.on("data", (chunk: Buffer) => {
    buffer.append(chunk)
    for (let message = buffer.readMessage(); message; message = buffer.readMessage()) {
      if (isJSONRPCResultResponse(message)) {
        pending.get(message.id)?.resolve(message.result)
        pending.delete(message.id)
      } else if (isJSONRPCErrorResponse(message) && message.id !== undefined) {
        pending.get(message.id)?.reject(new Error(message.error.message))
        pending.delete(message.id)
      }
    }
  })
  function send(messages: JSONRPCMessage[]) {
    const replies = messages.filter(isJSONRPCRequest).map((message) => {
      const reply = Promise.withResolvers<Record<string, unknown>>()
      pending.set(message.id, reply)
      return reply.promise
    })
    input.write(`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`)
    return Promise.all(replies)
  }
  async function close() {
    await adapter.close()
    input.destroy()
    output.destroy()
  }
  try {
    await adapter.server.connect(new StdioServerTransport(input, output))
    await send([
      {
        jsonrpc: "2.0",
        id: "initialize",
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "batch-cancellation-test", version: "1.0.0" },
        },
      },
    ])
    await send([{ jsonrpc: "2.0", method: "notifications/initialized" }])
    return { send, close }
  } catch (error) {
    await close()
    throw error
  }
}

describe("MCP cancellation in one stdio batch", () => {
  let cwd: string
  const sessions: Awaited<ReturnType<typeof stdioSession>>[] = []

  beforeEach(async () => {
    cwd = await realpath(await mkdtemp(join(tmpdir(), "sketchbook-cancellation-")))
  })

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.close()))
    vi.restoreAllMocks()
    await rm(cwd, { recursive: true, force: true })
  })

  it.each(
    ([0, "", 42, "write-request"] as const).flatMap((id) =>
      [false, true].map((replace) => ({ id, replace })),
    ),
  )("cancels request $id before storage entry, replacement=$replace", async ({ id, replace }) => {
    const stored = replace ? await new DocumentStore(cwd).write({ document }) : undefined
    const before = stored ? await readFile(stored.path, "utf8") : undefined
    const write = vi.spyOn(DocumentStore.prototype, "write")
    const session = await stdioSession(cwd)
    sessions.push(session)
    const [response] = await session.send([
      call(id, {
        document: { ...document, title: "Must not commit" },
        ...(stored ? { documentId: stored.stored.documentId, expectedRevision: 1 } : {}),
      }),
      cancel(id),
    ])
    const result = CallToolResultSchema.parse(response)
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: expect.stringMatching(/cancelled/),
    })
    expect(write).not.toHaveBeenCalled()
    if (stored) expect(await readFile(stored.path, "utf8")).toBe(before)
    else expect(await readdir(cwd)).toEqual([])
  })

  it("ignores a cancellation that comes before an unknown request", async () => {
    const session = await stdioSession(cwd)
    sessions.push(session)
    const [response] = await session.send([cancel(0), call(0, { document })])
    const result = CallToolResultSchema.parse(response)
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({ ok: true, revision: 1 })
  })

  it("keeps a matching cancellation when an older unknown cancellation has queued cleanup", async () => {
    const session = await stdioSession(cwd)
    sessions.push(session)
    const write = vi.spyOn(DocumentStore.prototype, "write")
    const [response] = await session.send([cancel(0), call(0, { document }), cancel(0)])
    const result = CallToolResultSchema.parse(response)
    expect(result.isError).toBe(true)
    expect(write).not.toHaveBeenCalled()
    expect(await readdir(cwd)).toEqual([])
  })

  it("cancels only the matching request when another write is in the same batch", async () => {
    const session = await stdioSession(cwd)
    sessions.push(session)
    const responses = await session.send([
      call(0, { document }),
      cancel(0),
      call("keep", { document: { ...document, title: "Keep this document" } }),
    ])
    const [cancelled, kept] = responses.map((response) => CallToolResultSchema.parse(response))
    expect(cancelled.isError).toBe(true)
    expect(kept.isError).not.toBe(true)
    expect(kept.structuredContent).toMatchObject({ ok: true, revision: 1 })
    const files = await readdir(join(cwd, ".pi/sketchbook"))
    expect(files.filter((file) => file.endsWith(".json"))).toHaveLength(1)
  })
})
