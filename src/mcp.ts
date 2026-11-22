import { readFileSync } from "node:fs"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  CallToolRequestSchema,
  CancelledNotificationSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type RequestId,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js"
import { createSketchbookTools } from "./sketchbook.js"

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))

/** Create one MCP session. Storage and the viewer remain inactive until a tool runs. */
export function createSketchbookMcpServer(cwd: string) {
  const tools = createSketchbookTools()
  const definitions = [tools.write, tools.read, tools.open, tools.readBook, tools.edit]
  const server = new Server(
    { name: "sketchbook", version },
    {
      capabilities: { tools: {} },
      instructions:
        "Create technical documents with Markdown, standalone code blocks, and static Diagram Design HTML. Save completed Diagram Design pages in `diagram-html` blocks. Do not put raw HTML in Markdown. Create documents without documentId or expectedRevision. Use sketchbook_edit to append to an existing page or add sections and chapters without replacing unrelated content. Read the target revision first; use sketchbook_write for deliberate full-page replacement. On conflict, read again. Saving does not verify rendering. Viewer URLs are private capabilities for trusted networks and expire when this server stops. Do not write the same document from different processes.",
    },
  )
  const catalog: Tool[] = definitions.map((tool) => ({
    name: tool.name,
    title: tool.label,
    description:
      tool.name === "sketchbook_read"
        ? "Read a saved Sketchbook document and its current revision before editing. The complete stored document is returned as JSON text and in structuredContent.stored."
        : tool.description,
    inputSchema: { ...tool.parameters, type: "object" },
    outputSchema: { ...tool.outputSchema, type: "object" },
    annotations: {
      readOnlyHint: tool.name !== "sketchbook_write" && tool.name !== "sketchbook_edit",
      openWorldHint: false,
    },
  }))

  const activeCalls = new Map<RequestId, AbortController>()
  const earlyCancellations = new Map<RequestId, AbortController>()
  server.setNotificationHandler(CancelledNotificationSchema, (notification) => {
    const { requestId } = notification.params
    if (requestId === undefined) return
    const active = activeCalls.get(requestId)
    const controller = active ?? new AbortController()
    controller.abort(new Error("Sketchbook tool request was cancelled."))
    if (!active) {
      earlyCancellations.set(requestId, controller)
      queueMicrotask(() => {
        if (earlyCancellations.get(requestId) === controller) earlyCancellations.delete(requestId)
      })
    }
  })
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: catalog }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = definitions.find((item) => item.name === request.params.name)
    if (!tool) throw new McpError(ErrorCode.InvalidParams, "Unknown Sketchbook tool.")
    const controller = earlyCancellations.get(extra.requestId) ?? new AbortController()
    earlyCancellations.delete(extra.requestId)
    activeCalls.set(extra.requestId, controller)
    try {
      const signal = AbortSignal.any([extra.signal, controller.signal])
      const result = await tool.execute(request.params.arguments, cwd, signal)
      const structuredContent =
        "contentTruncated" in result.structuredContent
          ? { ...result.structuredContent, contentTruncated: false }
          : result.structuredContent
      return {
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
        structuredContent,
        ...("isError" in result ? { isError: result.isError } : {}),
      }
    } finally {
      activeCalls.delete(extra.requestId)
    }
  })

  let closing: Promise<void> | undefined
  const close = (): Promise<void> => {
    closing ??= Promise.resolve().then(async () => {
      await Promise.all([tools.close(), server.close()])
    })
    return closing
  }
  server.onclose = () => {
    void close().catch((error) => server.onerror?.(error))
  }
  return { server, close }
}
