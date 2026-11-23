import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { registerPiInteraction } from "./pi-interaction.js"
import { registerSketchbookTools } from "./tools.js"

/** Loading only registers entry points and cleanup. No listener, timer, or file is created. */
export default function sketchbookExtension(pi: ExtensionAPI): void {
  const close = registerSketchbookTools(pi)
  const stopInteraction = registerPiInteraction(pi)
  pi.on("session_shutdown", async () => {
    await Promise.all([close(), stopInteraction()])
  })
}
