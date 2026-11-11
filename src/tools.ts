import { type ExtensionAPI, withFileMutationQueue } from "@earendil-works/pi-coding-agent"
import { createSketchbookTools, failed } from "./sketchbook.js"

export type { OpenInput, ReadInput } from "./sketchbook.js"

/** Register contracts now; allocate workspace resources only when a tool executes. */
export function registerSketchbookTools(pi: ExtensionAPI): () => Promise<void> {
  const tools = createSketchbookTools(withFileMutationQueue)
  for (const tool of [tools.write, tools.read, tools.open]) {
    pi.registerTool({
      ...tool,
      description:
        tool.name === "sketchbook_open"
          ? `${tool.description} Requires a persistent tui or rpc session. Reload, new, resume, fork, or shutdown invalidates the URL; open again in the new session.`
          : tool.description,
      async execute(_id, input, signal, _onUpdate, ctx) {
        if (tool.name === "sketchbook_open" && ctx.mode !== "tui" && ctx.mode !== "rpc") {
          return failed(
            new Error(
              "Sketchbook viewer requires a persistent tui or rpc session; print/json modes cannot keep it running.",
            ),
          )
        }
        return tool.execute(input, ctx.cwd, signal)
      },
    })
  }
  return tools.close
}
