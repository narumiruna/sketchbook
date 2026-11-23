import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { registerSketchbookTools } from "./tools.js"

export default function sketchbookExtension(pi: ExtensionAPI): void {
  const close = registerSketchbookTools(pi)
  pi.registerCommand("sketchbook", {
    description: "Create or update a Sketchbook page and open its Viewer",
    async handler(args) {
      pi.sendUserMessage(`/skill:sketchbook ${args}`, {
        deliverAs: "followUp",
        expandPromptTemplates: true,
      })
    },
  })
  pi.on("session_shutdown", async () => {
    await close()
  })
}
