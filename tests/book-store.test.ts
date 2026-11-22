import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { type BookEditInput, type Chapter, MAX_BOOK_BYTES, type Section } from "../src/book.js"
import {
  type DiagramDeck,
  MAX_BLOCKS,
  MAX_DOCUMENT_BYTES,
  MAX_SLIDES,
  type SketchbookDocument,
} from "../src/document.js"
import { withFileMutationQueue } from "../src/mutation-queue.js"
import { DocumentStore } from "../src/store.js"
import { drawing } from "./fixtures/static-drawing.js"

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return { ...actual, open: vi.fn(actual.open), rename: vi.fn(actual.rename) }
})

const text = { id: "text", type: "markdown", markdown: "Original text" } as const
const slide = {
  id: "overview",
  title: "Overview",
  svg: drawing("Start → Finish"),
  explanationMarkdown: "Start to finish.",
}
const deck: DiagramDeck = { id: "tour", type: "diagram-deck", title: "Tour", slides: [slide] }
const document: SketchbookDocument = { schemaVersion: 1, title: "First page", blocks: [text, deck] }
const section: Section = { id: "details", title: "Details", blocks: [text, deck] }
const chapter: Chapter = { id: "second", title: "Second", blocks: [text], sections: [section] }
const third: Chapter = { id: "third", title: "Third", blocks: [], sections: [] }
const addChapter = { type: "add-chapter", chapter } as const
const addSection = { type: "add-section", section } as const

let cwd: string
let store: DocumentStore
let documentId: string
let documentPath: string
let bookPath: string

function edit(
  expectedRevision: number,
  operation: BookEditInput["operation"],
  signal?: AbortSignal,
) {
  return store.editBook({ documentId, expectedRevision, operation }, signal)
}

beforeEach(async () => {
  cwd = await fs.mkdtemp(join(tmpdir(), "pi-sketchbook-book-"))
  store = new DocumentStore(cwd)
  const { stored, path } = await store.write({ document })
  documentId = stored.documentId
  documentPath = path
  bookPath = join(dirname(path), `${documentId}.book.json`)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(cwd, { recursive: true, force: true })
})

test("adds sections and chapters without touching v1; legacy replacements leave the sidecar intact", async () => {
  const original = await store.read(documentId)
  const originalBytes = await fs.readFile(documentPath, "utf8")
  expect(await store.readBook(documentId)).toBeUndefined()
  expect(await store.readViewer(documentId)).toEqual(original)
  await expect(edit(1, addSection)).rejects.toThrow("expected 1, current 0")
  expect(await edit(0, addSection)).toEqual({ revision: 1, record: "book" })
  expect(await store.readBook(documentId)).toMatchObject({ sections: [section], chapters: [] })
  expect(await edit(1, addChapter)).toEqual({ revision: 2, record: "book" })
  const book = await new DocumentStore(cwd).readBook(documentId)
  expect(book).toEqual({
    documentId,
    revision: 2,
    updatedAt: expect.any(String),
    sections: [section],
    chapters: [chapter],
  })
  const sidecarBytes = await fs.readFile(bookPath, "utf8")
  expect(sidecarBytes).toBe(`${JSON.stringify(book)}\n`)
  expect((await fs.stat(bookPath)).mode & 0o777).toBe(0o600)
  expect(await fs.readFile(documentPath, "utf8")).toBe(originalBytes)
  expect(await store.readViewer(documentId)).toEqual({ ...original, book })

  const replacement = { ...document, title: "Retitled first page", blocks: [text] }
  const { stored } = await store.write({ documentId, expectedRevision: 1, document: replacement })
  expect(await fs.readFile(bookPath, "utf8")).toBe(sidecarBytes)
  expect(await store.readViewer(documentId)).toEqual({ ...stored, book })
})

test("keeps SVG slides and the document preference independent of book revisions", async () => {
  const svgSlide = {
    id: "drawing",
    title: "Drawing",
    explanationMarkdown: "Offline diagram.",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><text>快取</text></svg>',
  }
  await expect(
    edit(1, { type: "append-slide", deckId: deck.id, slide: svgSlide }),
  ).resolves.toEqual({ revision: 2, record: "document" })
  await expect(edit(0, addSection)).resolves.toEqual({ revision: 1, record: "book" })
  await expect(
    edit(1, { type: "append-slide", sectionId: section.id, deckId: deck.id, slide: svgSlide }),
  ).resolves.toEqual({ revision: 2, record: "book" })
  const original = await store.read(documentId)
  const book = await store.readBook(documentId)
  expect(original.document.blocks).toContainEqual({ ...deck, slides: [slide, svgSlide] })
  expect(book?.sections[0].blocks).toContainEqual({ ...deck, slides: [slide, svgSlide] })
  const { stored } = await store.write({
    documentId,
    expectedRevision: 2,
    document: { ...original.document, defaultDiagramSource: "diagram-design" },
  })
  expect(stored.document).toEqual({ ...original.document, defaultDiagramSource: "diagram-design" })
  expect(await store.readBook(documentId)).toEqual(book)
  await expect(
    edit(2, {
      type: "replace-block",
      sectionId: section.id,
      block: { ...deck, slides: [{ ...svgSlide, svg: "<svg/>" }] },
    }),
  ).rejects.toThrow("Invalid static SVG")
  expect(await store.readBook(documentId)).toEqual(book)
})

test("changes only the target chapter, section, block or deck; reorder preserves chapter identities", async () => {
  await edit(0, addSection)
  await edit(1, addChapter)
  await edit(2, { ...addChapter, chapter: third })
  await edit(3, { ...addSection, chapterId: third.id, section: { ...section, id: "more" } })
  await edit(4, { type: "rename-section", sectionId: section.id, title: "Original section" })
  await edit(5, {
    type: "rename-section",
    chapterId: third.id,
    sectionId: "more",
    title: "Third section",
  })
  await edit(6, { type: "rename-chapter", chapterId: third.id, title: "Last" })
  await edit(7, { type: "reorder-chapters", chapterIds: [third.id, chapter.id] })
  const snippet = { id: "snippet", type: "code", code: "42" } as const
  await edit(8, { type: "append-block", chapterId: third.id, block: snippet })
  const newText = { ...text, markdown: "Replacement in third section" }
  await edit(9, { type: "replace-block", chapterId: third.id, sectionId: "more", block: newText })
  const detail = { ...slide, id: "detail", svg: drawing("Detail") }
  expect(
    await edit(10, {
      type: "append-slide",
      chapterId: third.id,
      sectionId: "more",
      deckId: deck.id,
      slide: detail,
    }),
  ).toEqual({ revision: 11, record: "book" })
  expect(await store.readBook(documentId)).toMatchObject({
    sections: [{ ...section, title: "Original section" }],
    chapters: [
      {
        ...third,
        title: "Last",
        blocks: [snippet],
        sections: [
          {
            id: "more",
            title: "Third section",
            blocks: [newText, { ...deck, slides: [slide, detail] }],
          },
        ],
      },
      chapter,
    ],
  })
  expect(await store.read(documentId)).toMatchObject({ revision: 1, document })
})

test("edits original blocks and slides with the document revision; replacement retains the block ID", async () => {
  await edit(0, addSection)
  const sidecar = await fs.readFile(bookPath, "utf8")
  const extra = { ...text, id: "extra" }
  await expect(edit(0, { type: "append-block", block: extra })).rejects.toThrow(
    "expected 0, current 1",
  )
  expect(await edit(1, { type: "append-block", block: extra })).toEqual({
    revision: 2,
    record: "document",
  })
  await expect(
    edit(2, { type: "replace-block", block: { ...text, id: "unknown" } }),
  ).rejects.toThrow("block not found")
  const replacement = { id: text.id, type: "code", code: "42" } as const
  expect(await edit(2, { type: "replace-block", block: replacement })).toEqual({
    revision: 3,
    record: "document",
  })
  const detail = { ...slide, id: "detail" }
  expect(await edit(3, { type: "append-slide", deckId: deck.id, slide: detail })).toEqual({
    revision: 4,
    record: "document",
  })
  expect(await store.read(documentId)).toMatchObject({
    revision: 4,
    document: { ...document, blocks: [replacement, { ...deck, slides: [slide, detail] }, extra] },
  })
  expect(await fs.readFile(bookPath, "utf8")).toBe(sidecar)
})

test("shares canonical locks across stores and shares the v1 lock with legacy writes", async () => {
  const alias = join(cwd, "alias")
  await fs.symlink(cwd, alias, "dir")
  const aliasedStore = new DocumentStore(alias)
  const results = await Promise.allSettled([
    edit(0, addSection),
    aliasedStore.editBook({ documentId, expectedRevision: 0, operation: addChapter }),
  ])
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  expect(results).toContainEqual({
    status: "rejected",
    reason: expect.objectContaining({ message: expect.stringContaining("Revision conflict") }),
  })
  const writes = await Promise.allSettled([
    edit(1, { type: "append-block", block: { ...text, id: "extra" } }),
    aliasedStore.write({ documentId, expectedRevision: 1, document }),
  ])
  expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  expect(writes).toContainEqual({
    status: "rejected",
    reason: expect.objectContaining({ message: expect.stringContaining("Revision conflict") }),
  })
  expect(await store.read(documentId)).toMatchObject({ revision: 2 })
  expect(await store.readBook(documentId)).toMatchObject({ revision: 1 })

  await expect(
    Promise.all([
      edit(2, { type: "append-slide", deckId: deck.id, slide: { ...slide, id: "detail" } }),
      edit(1, { type: "add-section", section: { ...section, id: "new" } }),
    ]),
  ).resolves.toEqual([
    { revision: 3, record: "document" },
    { revision: 2, record: "book" },
  ])
})

test("rejects duplicates, invalid targets, invalid order and unsafe SVG without consuming revisions", async () => {
  await edit(0, addSection)
  await edit(1, addChapter)
  const previous = await fs.readFile(bookPath, "utf8")
  const invalid: BookEditInput["operation"][] = [
    addChapter,
    addSection,
    { ...addChapter, chapter: { ...chapter, id: documentId } },
    { ...addSection, chapterId: "missing" },
    { type: "rename-chapter", chapterId: documentId, title: "Wrong record" },
    { type: "rename-section", sectionId: "missing", title: "Wrong section" },
    { type: "reorder-chapters", chapterIds: [] },
    { type: "reorder-chapters", chapterIds: [chapter.id, chapter.id] },
    { type: "reorder-chapters", chapterIds: [documentId] },
    { type: "append-block", sectionId: section.id, block: text },
    { type: "append-slide", sectionId: section.id, deckId: deck.id, slide },
    { type: "append-slide", sectionId: section.id, deckId: text.id, slide },
    {
      type: "append-slide",
      sectionId: section.id,
      deckId: deck.id,
      slide: { ...slide, id: "unsafe", svg: "<svg><script/></svg>" },
    },
  ]
  for (const operation of invalid) await expect(edit(2, operation)).rejects.toThrow()
  expect(await fs.readFile(bookPath, "utf8")).toBe(previous)
  expect(
    await edit(2, { type: "rename-section", sectionId: section.id, title: "Retry at revision 2" }),
  ).toEqual({ revision: 3, record: "book" })
})

test("enforces UTF-8 byte limits on the result in both revision domains", async () => {
  const large = "中".repeat(Math.ceil(MAX_BOOK_BYTES / 12))
  const blocks = Array.from({ length: 3 }, (_, i) => ({ ...text, id: `b${i}`, markdown: large }))
  await edit(0, { ...addSection, section: { ...section, blocks } })
  const previous = await fs.readFile(bookPath, "utf8")
  await expect(
    edit(1, { type: "append-block", sectionId: section.id, block: { ...text, markdown: large } }),
  ).rejects.toThrow("exceeds")
  expect(await fs.readFile(bookPath, "utf8")).toBe(previous)

  const original = await fs.readFile(documentPath, "utf8")
  await expect(
    edit(1, {
      type: "append-block",
      block: { ...text, id: "large", markdown: "中".repeat(Math.ceil(MAX_DOCUMENT_BYTES / 3)) },
    }),
  ).rejects.toThrow("exceeds")
  expect(await fs.readFile(documentPath, "utf8")).toBe(original)
})

test("counts stored chapter, section, block and slide limits after local edits", async () => {
  const blocks = [
    { ...deck, slides: Array.from({ length: MAX_SLIDES }, (_, i) => ({ ...slide, id: `s${i}` })) },
    ...Array.from({ length: MAX_BLOCKS - 1 }, (_, i) => ({ ...text, id: `b${i}` })),
  ]
  const sections = Array.from({ length: 32 }, (_, i) => ({
    ...section,
    id: `part${i}`,
    blocks: i === 0 ? blocks : [],
  }))
  await edit(0, { ...addChapter, chapter: { ...chapter, sections } })
  const content = { chapterId: chapter.id, sectionId: "part0" }
  await expect(
    edit(1, { type: "append-slide", ...content, deckId: deck.id, slide }),
  ).rejects.toThrow()
  await expect(edit(1, { type: "append-block", ...content, block: text })).rejects.toThrow()
  await expect(edit(1, { ...addSection, chapterId: chapter.id })).rejects.toThrow()
  for (let i = 1; i < 32; i++) await edit(i, { ...addChapter, chapter: { ...third, id: `ch${i}` } })
  await expect(edit(32, { ...addChapter, chapter: third })).rejects.toThrow()
  expect(await store.readBook(documentId)).toMatchObject({ revision: 32 })
})

test("rejects orphaned, symlinked, corrupt, oversized and mismatched sidecars", async () => {
  await edit(0, addChapter)
  const book = await store.readBook(documentId)
  const invalid = [
    "not JSON",
    " ".repeat(MAX_BOOK_BYTES + 1),
    JSON.stringify({ ...book, documentId: randomUUID() }),
  ]
  for (const contents of invalid) {
    await fs.writeFile(bookPath, contents)
    await expect(store.readBook(documentId)).rejects.toThrow()
    await expect(edit(1, addSection)).rejects.toThrow()
    expect(await fs.readFile(bookPath, "utf8")).toBe(contents)
    expect(await store.read(documentId)).toMatchObject({ revision: 1 })
  }
  await fs.unlink(bookPath)
  const target = join(cwd, "book.json")
  await fs.writeFile(target, JSON.stringify(book))
  await fs.symlink(target, bookPath)
  await expect(store.readBook(documentId)).rejects.toThrow("regular file")
  await expect(edit(0, addSection)).rejects.toThrow("regular file")
  await fs.unlink(bookPath)
  await fs.rename(target, bookPath)
  await fs.unlink(documentPath)
  await expect(store.readBook(documentId)).rejects.toMatchObject({ code: "ENOENT" })
  await expect(edit(1, addSection)).rejects.toMatchObject({ code: "ENOENT" })
  expect(JSON.parse(await fs.readFile(bookPath, "utf8"))).toEqual(book)
})

test("rejects an artifact ignore symlink to the sidecar even when the queue resolves symlinks", async () => {
  await edit(0, addChapter)
  const ignore = join(dirname(bookPath), ".gitignore")
  await fs.unlink(ignore)
  await fs.symlink(bookPath, ignore)
  const canonicalStore = new DocumentStore(cwd, async (key, operation) =>
    withFileMutationQueue(await fs.realpath(key), operation),
  )
  await expect(
    canonicalStore.editBook({ documentId, expectedRevision: 1, operation: addSection }),
  ).rejects.toThrow("regular file")
  expect(await store.readBook(documentId)).toMatchObject({ revision: 1, chapters: [chapter] })
})

test("snapshots edits before queueing and respects cancellation while queued", async () => {
  const controller = new AbortController()
  const release = Promise.withResolvers<void>()
  const queued = Promise.withResolvers<void>()
  const hold = withFileMutationQueue(bookPath, () => release.promise)
  const cancellable = new DocumentStore(cwd, (key, operation) => {
    const pending = withFileMutationQueue(key, operation)
    if (key === bookPath) queued.resolve()
    return pending
  })
  const mutable = structuredClone(section)
  const pending = edit(0, { ...addSection, section: mutable })
  const cancelled = expect(
    cancellable.editBook(
      { documentId, expectedRevision: 1, operation: addChapter },
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" })
  mutable.title = "Changed after invocation"
  await queued.promise
  controller.abort()
  release.resolve()
  await hold
  await expect(pending).resolves.toEqual({ revision: 1, record: "book" })
  await cancelled
  expect(await store.readBook(documentId)).toMatchObject({ sections: [section], chapters: [] })
  await expect(store.readBook(documentId, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  })
})

test("cleans temporary sidecars on failure or cancellation without consuming a revision", async () => {
  await edit(0, addSection)
  const previous = await fs.readFile(bookPath, "utf8")
  vi.mocked(fs.rename).mockRejectedValueOnce(new Error("Simulated disk failure"))
  await expect(edit(1, addChapter)).rejects.toThrow("disk failure")
  const controller = new AbortController()
  const { open, rename } = await vi.importActual<typeof fs>("node:fs/promises")
  await vi.mocked(fs.open).withImplementation(
    async (...args) => {
      const file = await open(...args)
      if (String(args[0]).endsWith(".tmp")) {
        const sync = file.sync.bind(file)
        vi.spyOn(file, "sync").mockImplementationOnce(async () => {
          await sync()
          controller.abort()
        })
      }
      return file
    },
    async () => {
      await expect(edit(1, addChapter, controller.signal)).rejects.toMatchObject({
        name: "AbortError",
      })
    },
  )
  expect(await fs.readFile(bookPath, "utf8")).toBe(previous)
  expect((await fs.readdir(dirname(bookPath))).filter((name) => name.endsWith(".tmp"))).toEqual([])

  const afterCommit = new AbortController()
  vi.mocked(fs.rename).mockImplementationOnce(async (...args) => {
    await rename(...args)
    afterCommit.abort()
  })
  expect(await edit(1, addChapter, afterCommit.signal)).toEqual({ revision: 2, record: "book" })
  expect(await store.readBook(documentId)).toMatchObject({ revision: 2, chapters: [chapter] })
})
