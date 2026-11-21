import { type Static, Type } from "typebox"
import {
  assertSchema,
  type Block,
  BlockSchema,
  DocumentIdSchema,
  IdSchema,
  MAX_BLOCKS,
  RevisionSchema,
  SlideSchema,
  TitleSchema,
  UpdatedAtSchema,
  validateBlocks,
} from "./document.js"

export const MAX_BOOK_BYTES = 4 * 1024 * 1024
const MAX_CHAPTERS = 32
const MAX_SECTIONS = 32

const blocks = Type.Array(BlockSchema, { maxItems: MAX_BLOCKS })
const SectionSchema = Type.Object(
  { id: IdSchema, title: TitleSchema, blocks },
  { additionalProperties: false },
)
const sections = Type.Array(SectionSchema, { maxItems: MAX_SECTIONS })
const ChapterSchema = Type.Object(
  { id: IdSchema, title: TitleSchema, blocks, sections },
  { additionalProperties: false },
)

export const StoredBookSchema = Type.Object(
  {
    documentId: DocumentIdSchema,
    revision: RevisionSchema,
    updatedAt: UpdatedAtSchema,
    sections,
    chapters: Type.Array(ChapterSchema, { maxItems: MAX_CHAPTERS }),
  },
  { additionalProperties: false },
)

const location = { chapterId: Type.Optional(IdSchema), sectionId: Type.Optional(IdSchema) }
const OperationSchema = Type.Union([
  Type.Object(
    { type: Type.Literal("add-chapter"), chapter: ChapterSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal("add-section"), chapterId: location.chapterId, section: SectionSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal("rename-chapter"), chapterId: IdSchema, title: TitleSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("reorder-chapters"),
      chapterIds: Type.Array(IdSchema, { maxItems: MAX_CHAPTERS, uniqueItems: true }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal("rename-section"), ...location, sectionId: IdSchema, title: TitleSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal("append-block"), ...location, block: BlockSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal("replace-block"), ...location, block: BlockSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal("append-slide"), ...location, deckId: IdSchema, slide: SlideSchema },
    { additionalProperties: false },
  ),
])

export const BookEditInputSchema = Type.Object(
  {
    documentId: DocumentIdSchema,
    expectedRevision: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    operation: OperationSchema,
  },
  { additionalProperties: false },
)

export type BookEditInput = Static<typeof BookEditInputSchema>
export type StoredBook = Static<typeof StoredBookSchema>
export type Chapter = Static<typeof ChapterSchema>
export type Section = Static<typeof SectionSchema>
type Operation = BookEditInput["operation"]
type ContentEdit = Extract<Operation, { type: "append-block" | "replace-block" | "append-slide" }>

function validateSections(sections: Section[]): void {
  const ids = new Set<string>()
  for (const section of sections) {
    if (ids.has(section.id)) throw new Error(`Duplicate section ID: ${section.id}`)
    ids.add(section.id)
    validateBlocks(section.blocks)
  }
}

export function validateStoredBook(value: unknown): StoredBook {
  assertSchema(StoredBookSchema, value)
  if (Number.isNaN(Date.parse(value.updatedAt)))
    throw new Error("Invalid sketchbook updatedAt timestamp")
  validateSections(value.sections)
  const ids = new Set([value.documentId])
  for (const chapter of value.chapters) {
    if (ids.has(chapter.id)) throw new Error(`Duplicate chapter ID: ${chapter.id}`)
    ids.add(chapter.id)
    validateBlocks(chapter.blocks)
    validateSections(chapter.sections)
  }
  return value
}

export function isDocumentEdit(operation: Operation): operation is ContentEdit & {
  chapterId?: undefined
  sectionId?: undefined
} {
  return (
    (operation.type === "append-block" ||
      operation.type === "replace-block" ||
      operation.type === "append-slide") &&
    operation.chapterId === undefined &&
    operation.sectionId === undefined
  )
}

export function applyContentEdit(blocks: Block[], operation: ContentEdit): void {
  switch (operation.type) {
    case "append-block":
      blocks.push(operation.block)
      break
    case "replace-block": {
      const index = blocks.findIndex((block) => block.id === operation.block.id)
      if (index < 0) throw new Error(`Sketchbook block not found: ${operation.block.id}`)
      blocks[index] = operation.block
      break
    }
    case "append-slide": {
      const deck = blocks.find((block) => block.id === operation.deckId)
      if (deck?.type !== "diagram-deck")
        throw new Error(`Sketchbook diagram deck not found: ${operation.deckId}`)
      deck.slides.push(operation.slide)
      break
    }
  }
}

function findChapter(book: StoredBook, chapterId: string): Chapter {
  const chapter = book.chapters.find((chapter) => chapter.id === chapterId)
  if (!chapter) throw new Error(`Sketchbook chapter not found: ${chapterId}`)
  return chapter
}

function findSection(sections: Section[], sectionId: string): Section {
  const section = sections.find((section) => section.id === sectionId)
  if (!section) throw new Error(`Sketchbook section not found: ${sectionId}`)
  return section
}

function chapterSections(book: StoredBook, chapterId?: string): Section[] {
  return chapterId === undefined ? book.sections : findChapter(book, chapterId).sections
}

export function applyBookEdit(book: StoredBook, operation: Operation): void {
  switch (operation.type) {
    case "add-chapter":
      book.chapters.push(operation.chapter)
      break
    case "add-section":
      chapterSections(book, operation.chapterId).push(operation.section)
      break
    case "rename-chapter":
      findChapter(book, operation.chapterId).title = operation.title
      break
    case "reorder-chapters":
      if (operation.chapterIds.length !== book.chapters.length)
        throw new Error("Chapter order must include every additional chapter exactly once")
      book.chapters = operation.chapterIds.map((id) => findChapter(book, id))
      break
    case "rename-section":
      findSection(chapterSections(book, operation.chapterId), operation.sectionId).title =
        operation.title
      break
    case "append-block":
    case "replace-block":
    case "append-slide":
      if (operation.sectionId !== undefined) {
        const section = findSection(chapterSections(book, operation.chapterId), operation.sectionId)
        applyContentEdit(section.blocks, operation)
      } else if (operation.chapterId !== undefined) {
        applyContentEdit(findChapter(book, operation.chapterId).blocks, operation)
      } else {
        throw new Error("A book content edit requires a chapter or section ID")
      }
      break
  }
}
