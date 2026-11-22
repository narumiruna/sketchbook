import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Chapter } from "../src/book.js"
import type { SketchbookDocument } from "../src/document.js"
import { ViewerServer } from "../src/server.js"
import { DocumentStore } from "../src/store.js"

interface Volume {
  document: SketchbookDocument
  chapters: Chapter[]
}

async function main() {
  const workspace = await mkdtemp(join(tmpdir(), "sketchbook-demo-"))
  const store = new DocumentStore(workspace)
  const viewer = new ViewerServer(store, new URL("../dist/web/", import.meta.url), "127.0.0.1")
  const controller = new AbortController()
  const { signal } = controller
  const interrupted = once(signal, "abort")
  const stop = () => controller.abort()
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    const documentIds: string[] = []
    for (const volume of [1, 2]) {
      const path = new URL(`../demo/atlas-volume-${volume}.json`, import.meta.url)
      const { document, chapters } = JSON.parse(
        await readFile(path, { encoding: "utf8", signal }),
      ) as Volume
      const { stored } = await store.write({ document }, signal)
      const { documentId } = stored
      for (const [expectedRevision, chapter] of chapters.entries()) {
        await store.editBook(
          {
            documentId,
            expectedRevision,
            operation: { type: "add-chapter", chapter },
          },
          signal,
        )
      }
      documentIds.push(documentId)
    }
    const urls = await Promise.all(documentIds.map((id) => viewer.open(id, signal)))
    console.log("Diagram Atlas (Traditional Chinese): open a link in your local browser.")
    console.log(`Volume 1 (pages 01–26): ${urls[0]}`)
    console.log(`Volume 2 (pages 27–51): ${urls[1]}`)
    console.log("Press Ctrl+C to stop the Viewer.")
    await interrupted
  } catch (error) {
    if (!signal.aborted) throw error
  } finally {
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
    try {
      await viewer.close()
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : "Sketchbook demo failed.")
  process.exitCode = 1
}
