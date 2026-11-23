import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent"
import type { BookEditInput } from "../src/book.js"
import type { SketchbookDocument } from "../src/document.js"
import { registerPiInteraction } from "../src/pi-interaction.js"
import { ViewerServer } from "../src/server.js"
import { DocumentStore } from "../src/store.js"

const workspace = await mkdtemp(join(tmpdir(), "pi-sketchbook-browser-"))
const store = new DocumentStore(workspace)
const assets = new URL("../dist/web/", import.meta.url)
const viewer = new ViewerServer(store, assets)
const commands = new Map<string, RegisteredCommand["handler"]>()
const messages: Parameters<ExtensionAPI["sendUserMessage"]>[] = []
const stopInteraction = registerPiInteraction(
  {
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command.handler)
    },
    sendUserMessage: (...args: Parameters<ExtensionAPI["sendUserMessage"]>) => messages.push(args),
  } as unknown as ExtensionAPI,
  assets,
)
const coordinator = createServer((request, response) => {
  void (async () => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1:4179").pathname
    response.setHeader("Content-Type", "application/json")
    if (request.method === "GET" && path === "/health") {
      response.end(JSON.stringify({ ready: true }))
      return
    }
    if (request.method === "GET" && path === "/messages") {
      response.end(JSON.stringify(messages))
      return
    }
    if (request.method !== "POST" || !["/documents", "/books", "/interaction"].includes(path)) {
      response.writeHead(404).end()
      return
    }
    let body = ""
    for await (const chunk of request) {
      body += chunk
      if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error("Test fixture too large")
    }
    if (path === "/interaction") {
      let notice = ""
      const command = commands.get("sketchbook-interact")
      if (!command) throw new Error("Interaction command is missing")
      await command(JSON.parse(body).documentId, {
        mode: "rpc",
        cwd: workspace,
        hasPendingMessages: () => false,
        ui: {
          notify: (text: string) => {
            notice = text
          },
        },
      } as unknown as ExtensionCommandContext)
      const url = notice.split("\n")[1]
      if (!url) throw new Error("Could not open the interaction fixture")
      messages.length = 0
      response.end(JSON.stringify({ url }))
      return
    }
    if (path === "/books") {
      response.end(JSON.stringify(await store.editBook(JSON.parse(body) as BookEditInput)))
      return
    }
    const input = JSON.parse(body) as {
      document: SketchbookDocument
      documentId?: string
      expectedRevision?: number
    }
    const { stored } = await store.write(input)
    response.end(JSON.stringify({ stored, url: await viewer.open(stored.documentId) }))
  })().catch((error: unknown) => {
    response
      .writeHead(400)
      .end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  })
})
await new Promise<void>((accept) => coordinator.listen(4179, "127.0.0.1", accept))
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  const closed = new Promise<void>((accept) => coordinator.close(() => accept()))
  coordinator.closeAllConnections()
  await Promise.all([closed, viewer.close(), stopInteraction()])
  await rm(workspace, { recursive: true, force: true })
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void stop())
}
