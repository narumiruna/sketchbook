import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import type { SketchbookDocument } from "../src/document.js"
import { RetiredMermaidError } from "../src/retired-format.js"
import { ViewerServer } from "../src/server.js"
import { createSketchbookTools } from "../src/sketchbook.js"
import { DocumentStore } from "../src/store.js"
import { legacyDeck, legacySlide } from "./fixtures/legacy-mermaid.js"

const document: SketchbookDocument = {
  schemaVersion: 1,
  title: "A supported introduction",
  blocks: [{ id: "intro", type: "markdown", markdown: "This page is supported." }],
}
const section = { id: "section", title: "Section", blocks: [] }
const chapter = { id: "chapter", title: "Chapter", blocks: [], sections: [] }
const legacySection = { ...section, blocks: [legacyDeck] }
let cwd: string
let store: DocumentStore
let saved: Awaited<ReturnType<DocumentStore["write"]>>
let bookPath: string
let viewer: ViewerServer

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "sketchbook-retired-"))
  store = new DocumentStore(cwd)
  saved = await store.write({ document })
  bookPath = saved.path.replace(/\.json$/, ".book.json")
  const assets = join(cwd, "viewer")
  await mkdir(assets)
  await writeFile(join(assets, "index.html"), "<!doctype html><title>Test viewer</title>")
  viewer = new ViewerServer(store, assets)
})

afterEach(async () => {
  await viewer.close()
  await rm(cwd, { recursive: true, force: true })
})

test.each(["original page", "first-page section", "chapter", "chapter section"])(
  "rejects a legacy %s without changing either record",
  async (location) => {
    const { documentId, updatedAt } = saved.stored
    const url = new URL(await viewer.open(documentId))
    const endpoint = new URL(`/api/documents/${documentId}`, url)
    const token = new URLSearchParams(url.hash.slice(1)).get("token")
    const originalPage = location === "original page"
    if (originalPage) {
      await writeFile(
        saved.path,
        JSON.stringify({ ...saved.stored, document: { ...document, blocks: [legacyDeck] } }),
      )
    }
    await writeFile(
      bookPath,
      JSON.stringify({
        documentId,
        revision: 1,
        updatedAt,
        sections: location === "first-page section" ? [legacySection] : [section],
        chapters:
          location === "chapter"
            ? [{ ...chapter, blocks: [legacyDeck] }]
            : location === "chapter section"
              ? [{ ...chapter, sections: [legacySection] }]
              : [chapter],
      }),
    )
    const originalBytes = await readFile(saved.path)
    const sidecarBytes = await readFile(bookPath)
    const message = originalPage
      ? "The original page contains"
      : "A book chapter or section contains"
    const tools = createSketchbookTools()
    try {
      const read = await tools.read.execute({ documentId }, cwd)
      if (originalPage) {
        expect(read?.structuredContent).toMatchObject({
          ok: false,
          error: expect.stringContaining(message),
        })
        await expect(store.write({ documentId, expectedRevision: 1, document })).rejects.toThrow(
          RetiredMermaidError,
        )
      } else expect(read?.structuredContent).toMatchObject({ ok: true, stored: saved.stored })
      for (const tool of [tools.open, tools.readBook]) {
        const result = await tool.execute({ documentId }, cwd)
        expect(result?.structuredContent).toMatchObject({
          ok: false,
          error: expect.stringContaining(message),
        })
      }
    } finally {
      await tools.close()
    }
    await expect(
      store.editBook({
        documentId,
        expectedRevision: 1,
        operation: { type: "rename-chapter", chapterId: chapter.id, title: "Not applied" },
      }),
    ).rejects.toThrow(RetiredMermaidError)
    expect((await fetch(endpoint)).status).toBe(401)
    const error = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, "If-None-Match": "*" },
    })
    expect(error.status).toBe(422)
    const body = await error.text()
    expect(body).toContain(message)
    expect(body).toContain("10bc857")
    expect(body).not.toContain("Private legacy label")
    expect(body).not.toContain(cwd)
    expect(body).not.toContain(token)
    expect(await readFile(saved.path)).toEqual(originalBytes)
    expect(await readFile(bookPath)).toEqual(sidecarBytes)
  },
)

test("rejects legacy input in any edit without creating a sidecar or consuming a revision", async () => {
  const { documentId } = saved.stored
  const originalBytes = await readFile(saved.path)
  for (const operation of [
    { type: "append-slide", deckId: "legacy", slide: legacySlide },
    { type: "append-block", block: legacyDeck },
    { type: "replace-block", block: legacyDeck },
    { type: "add-section", section: legacySection },
    { type: "add-chapter", chapter: { ...chapter, sections: [legacySection] } },
  ]) {
    await expect(store.editBook({ documentId, expectedRevision: 0, operation })).rejects.toThrow(
      RetiredMermaidError,
    )
  }
  expect(await readFile(saved.path)).toEqual(originalBytes)
  await expect(readFile(bookPath)).rejects.toMatchObject({ code: "ENOENT" })
})
