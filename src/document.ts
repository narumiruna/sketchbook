import { type Static, type TSchema, Type } from "typebox"
import { Check, Errors } from "typebox/value"
import { MAX_DESIGN_HTML_BYTES, prepareDesignHtml } from "./design-html.js"
import { rejectRetiredDocument, rejectRetiredDocumentEnvelope } from "./retired-format.js"
import { inspectStaticSvg, MAX_SVG_BYTES } from "./static-svg.js"

export const MAX_DOCUMENT_BYTES = 1024 * 1024
export const MAX_BLOCKS = 100
export const MAX_SLIDES = 20

export const IdSchema = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$" })
const TextSchema = Type.String({ minLength: 1, maxLength: MAX_DOCUMENT_BYTES, pattern: "\\S" })
export const TitleSchema = Type.String({ minLength: 1, maxLength: 512, pattern: "\\S" })
export const RevisionSchema = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
export const UpdatedAtSchema = Type.String({ minLength: 1, maxLength: 32 })

export const DocumentIdSchema = Type.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  description: "Document ID returned by sketchbook_write; not a file path.",
})

export const MarkdownBlockSchema = Type.Object(
  { id: IdSchema, type: Type.Literal("markdown"), markdown: TextSchema },
  { additionalProperties: false },
)

export const CodeBlockSchema = Type.Object(
  {
    id: IdSchema,
    type: Type.Literal("code"),
    code: TextSchema,
    language: Type.Optional(Type.String({ minLength: 1, maxLength: 64, pattern: "\\S" })),
  },
  { additionalProperties: false },
)

export const SlideSchema = Type.Object(
  {
    id: IdSchema,
    title: TitleSchema,
    explanationMarkdown: TextSchema,
    svg: Type.String({ minLength: 1, maxLength: MAX_SVG_BYTES }),
  },
  { additionalProperties: false },
)

export const DiagramDeckSchema = Type.Object(
  {
    id: IdSchema,
    type: Type.Literal("diagram-deck"),
    title: TitleSchema,
    slides: Type.Array(SlideSchema, { minItems: 1, maxItems: MAX_SLIDES }),
  },
  { additionalProperties: false },
)

const DesignHtmlBlockSchema = Type.Object(
  {
    id: IdSchema,
    type: Type.Literal("diagram-html"),
    title: TitleSchema,
    html: Type.String({ minLength: 1, maxLength: MAX_DESIGN_HTML_BYTES }),
  },
  { additionalProperties: false },
)

export const BlockSchema = Type.Union([
  MarkdownBlockSchema,
  CodeBlockSchema,
  DiagramDeckSchema,
  DesignHtmlBlockSchema,
])

export const SketchbookDocumentSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    title: TitleSchema,
    defaultDiagramSource: Type.Optional(
      Type.Union([Type.Literal("mermaid"), Type.Literal("diagram-design")], {
        description: "Deprecated authoring preference. Ignored; omit in new documents.",
      }),
    ),
    blocks: Type.Array(BlockSchema, {
      minItems: 1,
      maxItems: MAX_BLOCKS,
    }),
  },
  { additionalProperties: false },
)

export const WriteInputSchema = Type.Object(
  {
    document: SketchbookDocumentSchema,
    documentId: Type.Optional(DocumentIdSchema),
    expectedRevision: Type.Optional(RevisionSchema),
  },
  { additionalProperties: false },
)

export const StoredDocumentSchema = Type.Object(
  {
    documentId: DocumentIdSchema,
    revision: RevisionSchema,
    updatedAt: UpdatedAtSchema,
    document: SketchbookDocumentSchema,
  },
  { additionalProperties: false },
)

export type SketchbookDocument = Static<typeof SketchbookDocumentSchema>
export type MarkdownBlock = Static<typeof MarkdownBlockSchema>
export type CodeBlock = Static<typeof CodeBlockSchema>
export type DesignHtmlBlock = Static<typeof DesignHtmlBlockSchema>
export type DiagramDeck = Static<typeof DiagramDeckSchema>
export type Block = Static<typeof BlockSchema>
export type WriteInput = Static<typeof WriteInputSchema>
export type StoredDocument = Static<typeof StoredDocumentSchema>

export function assertSchema<T extends TSchema>(
  schema: T,
  value: unknown,
): asserts value is Static<T> {
  if (!Check(schema, value)) {
    const errors = Errors(schema, value)
      .slice(0, 3)
      .map((error) => `${error.instancePath || "/"}: ${error.message}`)
      .join("; ")
    throw new Error(`Invalid sketchbook data: ${errors}`)
  }
}

export function validateDocumentId(id: string): void {
  assertSchema(DocumentIdSchema, id)
}

export function validateBlocks(blocks: Block[]): void {
  const blockIds = new Set<string>()
  for (const block of blocks) {
    if (blockIds.has(block.id)) throw new Error(`Duplicate block ID: ${block.id}`)
    blockIds.add(block.id)
    if (block.type === "diagram-html") {
      try {
        prepareDesignHtml(block.html)
      } catch (error) {
        throw new Error(`${block.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (block.type !== "diagram-deck") continue
    const slideIds = new Set<string>()
    for (const slide of block.slides) {
      const location = `${block.id}/${slide.id}`
      if (slideIds.has(slide.id)) throw new Error(`Duplicate slide ID: ${location}`)
      slideIds.add(slide.id)
      try {
        inspectStaticSvg(slide.svg)
      } catch (error) {
        throw new Error(`${location}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}

export function validateDocument(value: unknown): SketchbookDocument {
  rejectRetiredDocument(value)
  assertSchema(SketchbookDocumentSchema, value)
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_DOCUMENT_BYTES) {
    throw new Error(`Sketchbook document exceeds ${MAX_DOCUMENT_BYTES} bytes`)
  }
  validateBlocks(value.blocks)
  return value
}

export function validateWriteInput(value: unknown): WriteInput {
  rejectRetiredDocumentEnvelope(value)
  assertSchema(WriteInputSchema, value)
  if ((value.documentId === undefined) !== (value.expectedRevision === undefined)) {
    throw new Error("Updates require both documentId and expectedRevision; creates omit both")
  }
  validateDocument(value.document)
  return value
}

export function validateStoredDocument(value: unknown): StoredDocument {
  rejectRetiredDocumentEnvelope(value)
  assertSchema(StoredDocumentSchema, value)
  if (Number.isNaN(Date.parse(value.updatedAt)))
    throw new Error("Invalid sketchbook updatedAt timestamp")
  validateDocument(value.document)
  return value
}
