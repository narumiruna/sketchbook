import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { validateDocumentId } from "./document.js"
import { ViewerServer } from "./server.js"
import { DocumentStore } from "./store.js"

export function registerPiInteraction(pi: ExtensionAPI, assets?: URL): () => Promise<void> {
  let active: ViewerServer | undefined
  let opening: ViewerServer | undefined

  async function stop() {
    const viewers = [active, opening]
    active = undefined
    opening = undefined
    await Promise.all(viewers.map((viewer) => viewer?.close()))
  }

  pi.registerCommand("sketchbook-interact", {
    description: "Open a local Viewer that can send feedback to Pi, or stop it",
    async handler(args, ctx) {
      if (ctx.mode !== "tui" && ctx.mode !== "rpc") {
        ctx.ui.notify("Sketchbook interaction requires a persistent Pi session.", "warning")
        return
      }
      const documentId = args.trim()
      if (documentId === "stop") {
        await stop()
        ctx.ui.notify("Sketchbook interaction stopped.", "info")
        return
      }
      try {
        validateDocumentId(documentId)
      } catch {
        ctx.ui.notify("Usage: /sketchbook-interact <documentId|stop>", "warning")
        return
      }
      if (opening) {
        ctx.ui.notify("A Sketchbook Viewer is already opening.", "warning")
        return
      }
      const viewer = new ViewerServer(new DocumentStore(ctx.cwd), assets, "127.0.0.1", {
        documentId,
        send(feedback) {
          if (active !== viewer || ctx.hasPendingMessages()) return false
          pi.sendUserMessage(
            `Feedback submitted by the user from Sketchbook Viewer. The location fields are context for the notes.\n${JSON.stringify({ documentId, ...feedback }, null, 2)}`,
            { deliverAs: "followUp", expandPromptTemplates: false },
          )
          return true
        },
      })
      opening = viewer
      try {
        const url = await viewer.open(documentId)
        if (opening !== viewer) return
        await active?.close()
        if (opening !== viewer) return
        active = viewer
        ctx.ui.notify(`Private Sketchbook link (same device only):\n${url}`, "info")
      } catch {
        if (opening === viewer) {
          ctx.ui.notify("Could not open the Sketchbook document for interaction.", "error")
        }
        await viewer.close()
      } finally {
        if (opening === viewer) opening = undefined
      }
    },
  })
  return stop
}
