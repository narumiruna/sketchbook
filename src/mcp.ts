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
  const definitions = [tools.write, tools.read, tools.open]
  const server = new Server(
    { name: "sketchbook", version },
    {
      capabilities: { tools: {} },
      instructions:
        "Create technical documents with Markdown and Mermaid flowchart diagram decks. Only flowchart diagrams are supported. Do not use Mermaid directives, frontmatter, HTML, images, icons, click actions, or node metadata. Create documents without documentId or expectedRevision. Read before updates and submit the complete document with the current expectedRevision. On conflict, read again. Saving does not verify rendering. Viewer URLs are private capabilities for trusted networks and expire when this server stops. Do not write the same document from different processes.",
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
    // MCP requires an object root; the shared union defines success and failure shapes.
    outputSchema: { ...tool.outputSchema, type: "object" },
    annotations: { readOnlyHint: tool.name !== "sketchbook_write", openWorldHint: false },
  }))

  // SDK 1.32.2 ignores cancellation for falsy IDs. Track all valid tool request IDs.
  const activeCalls = new Map<RequestId, AbortController>()
  server.setNotificationHandler(CancelledNotificationSchema, (notification) => {
    const { requestId } = notification.params
    if (requestId !== undefined) {
      activeCalls.get(requestId)?.abort(new Error("Sketchbook tool request was cancelled."))
    }
  })
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: catalog }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = definitions.find((item) => item.name === request.params.name)
    if (!tool) throw new McpError(ErrorCode.InvalidParams, "Unknown Sketchbook tool.")
    const controller = new AbortController()
    activeCalls.set(extra.requestId, controller)
    try {
      const signal = AbortSignal.any([extra.signal, controller.signal])
      const result = await tool.execute(request.params.arguments, cwd, signal)
      // MCP returns the complete JSON, not the bounded text preview used by Pi.
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
    // Defer transport closure so onclose cannot reenter before closing is assigned.
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
