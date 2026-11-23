import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { BookEditInput } from "../src/book.js"
import type { SketchbookDocument } from "../src/document.js"
import { ViewerServer } from "../src/server.js"
import { DocumentStore } from "../src/store.js"

const workspace = await mkdtemp(join(tmpdir(), "pi-sketchbook-browser-"))
const store = new DocumentStore(workspace)
const assets = new URL("../dist/web/", import.meta.url)
const viewer = new ViewerServer(store, assets)
let annotationViewer: ViewerServer | undefined
let deliveries: string[] = []
const coordinator = createServer((request, response) => {
  void (async () => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1:4179").pathname
    response.setHeader("Content-Type", "application/json")
    if (request.method === "GET" && path === "/health") {
      response.end(JSON.stringify({ ready: true }))
      return
    }
    if (request.method === "GET" && path === "/annotation-deliveries") {
      response.end(JSON.stringify(deliveries))
      return
    }
    if (
      request.method !== "POST" ||
      !["/documents", "/books", "/annotation-viewer"].includes(path)
    ) {
      response.writeHead(404).end()
      return
    }
    let body = ""
    for await (const chunk of request) {
      body += chunk
      if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error("Test fixture too large")
    }
    if (path === "/annotation-viewer") {
      const { documentId } = JSON.parse(body) as { documentId: string }
      await annotationViewer?.close()
      deliveries = []
      annotationViewer = new ViewerServer(store, assets, "127.0.0.1", {
        documentId,
        send(message) {
          deliveries.push(message)
          return true
        },
      })
      response.end(JSON.stringify({ url: await annotationViewer.open(documentId) }))
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
  await Promise.all([closed, viewer.close(), annotationViewer?.close()])
  await rm(workspace, { recursive: true, force: true })
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void stop())
}
