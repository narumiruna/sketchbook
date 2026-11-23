import { type ExtensionAPI, withFileMutationQueue } from "@earendil-works/pi-coding-agent"
import { createSketchbookTools, failed, PiOpenInputSchema } from "./sketchbook.js"

export type { OpenInput, ReadInput } from "./sketchbook.js"

/** Register contracts now; allocate workspace resources only when a tool executes. */
export function registerSketchbookTools(pi: ExtensionAPI): () => Promise<void> {
  const tools = createSketchbookTools(withFileMutationQueue)
  for (const tool of [tools.write, tools.read, tools.open, tools.readBook, tools.edit]) {
    pi.registerTool({
      ...tool,
      ...(tool.name === "sketchbook_open"
        ? {
            parameters: PiOpenInputSchema,
            promptSnippet: "Open the Sketchbook Viewer with optional same-device feedback to Pi",
            description:
              "Return a private Viewer URL without launching a browser or verifying rendering. Set sendFeedback to true for a same-device, loopback-only link with a Send to Pi button for this document. Otherwise, the read-only Viewer listens on all IPv4 interfaces and automatically uses a private LAN address or falls back to loopback. Keep the full URL private; use LAN links only on trusted networks. Requires a persistent tui or rpc session. Reload, new, resume, fork, or shutdown invalidates the URL.",
          }
        : {}),
      async execute(_id, input, signal, _onUpdate, ctx) {
        if (tool.name !== "sketchbook_open") return tool.execute(input, ctx.cwd, signal)
        if (ctx.mode !== "tui" && ctx.mode !== "rpc") {
          return failed(
            new Error(
              "Sketchbook viewer requires a persistent tui or rpc session; print/json modes cannot keep it running.",
            ),
          )
        }
        return tool.execute(input, ctx.cwd, signal, (message) => {
          if (ctx.hasPendingMessages()) return false
          pi.sendUserMessage(message, { deliverAs: "followUp", expandPromptTemplates: false })
          return true
        })
      },
    })
  }
  return tools.close
}
