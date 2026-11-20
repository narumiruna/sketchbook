import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SketchbookDocument } from "../src/document.js"
import { ViewerServer } from "../src/server.js"
import { DocumentStore } from "../src/store.js"

// This coordinator is test-only. The production viewer remains read-only and
// serves real stored documents and built assets on its own random IPv4 port.
const workspace = await mkdtemp(join(tmpdir(), "pi-sketchbook-browser-"))
const store = new DocumentStore(workspace)
const viewer = new ViewerServer(store, new URL("../dist/web/", import.meta.url))
const coordinator = createServer((request, response) => {
  void (async () => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1:4179").pathname
    response.setHeader("Content-Type", "application/json")
    if (request.method === "GET" && path === "/health") {
      response.end(JSON.stringify({ ready: true }))
      return
    }
    if (request.method === "GET" && path.startsWith("/assets/")) {
      const name = path.slice("/assets/".length)
      if (
        !["architecture-walkthrough", "process-walkthrough", "sequence-walkthrough"].includes(name)
      ) {
        response.writeHead(404).end()
        return
      }
      response.end(
        await readFile(
          new URL(`../skills/sketchbook-explain-diagrams/assets/${name}.json`, import.meta.url),
        ),
      )
      return
    }
    if (request.method !== "POST" || path !== "/documents") {
      response.writeHead(404).end()
      return
    }
    let body = ""
    for await (const chunk of request) {
      body += chunk
      if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error("Test fixture too large")
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
  await Promise.all([closed, viewer.close()])
  await rm(workspace, { recursive: true, force: true })
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void stop())
}
