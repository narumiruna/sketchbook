import { describe, expect, test } from "vitest"
import {
  MAX_DOCUMENT_BYTES,
  type SketchbookDocument,
  validateDocument,
  validateDocumentId,
  validateWriteInput,
} from "../src/document.js"
import { MAX_SVG_BYTES } from "../src/static-svg.js"
import { drawing } from "./fixtures/static-drawing.js"

function document(source = drawing("Start → Finish")): SketchbookDocument {
  return {
    schemaVersion: 1,
    title: "Example",
    blocks: [
      {
        id: "walkthrough",
        type: "diagram-deck",
        title: "Walkthrough",
        slides: [
          {
            id: "overview",
            title: "Overview",
            svg: source,
            explanationMarkdown: "Start to finish.",
          },
        ],
      },
    ],
  }
}

describe("document validation", () => {
  test("accepts the bounded contract and non-ASCII labels", () => {
    const value = document(drawing("開始 → Finish"))
    expect(validateDocument(value)).toBe(value)
  })

  test.each([
    ["schema version", { ...document(), schemaVersion: 2 }],
    ["extra properties", { ...document(), executable: "run" }],
    ["empty blocks", { ...document(), blocks: [] }],
    ["unknown block", { ...document(), blocks: [{ id: "a", type: "html", html: "<script/>" }] }],
    ["path IDs", { ...document(), blocks: [{ id: "../x", type: "markdown", markdown: "text" }] }],
    [
      "block limit",
      {
        ...document(),
        blocks: Array.from({ length: 101 }, (_, i) => ({
          id: `b${i}`,
          type: "markdown",
          markdown: "text",
        })),
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(() => validateDocument(value)).toThrow()
  })

  test("accepts standalone code blocks with or without a language", () => {
    const value = document()
    const code = "\n\t<div>Hello & goodbye</div>\n\n"
    value.blocks.push(
      { id: "markup", type: "code", code, language: "HTML" },
      { id: "text", type: "code", code },
    )
    expect(validateDocument(value)).toBe(value)
  })

  test.each([
    { code: undefined },
    { code: "" },
    { code: " \t\n" },
    { code: 42 },
    { language: " " },
    { language: "x".repeat(65) },
    { markdown: "unexpected" },
  ])("rejects invalid code block fields: %o", (fields) => {
    expect(() =>
      validateDocument({
        ...document(),
        blocks: [{ id: "snippet", type: "code", code: "hello", ...fields }],
      }),
    ).toThrow("Invalid sketchbook data")
  })

  test("rejects empty decks and duplicate block/slide IDs", () => {
    const value = document()
    const deck = value.blocks[0]
    if (deck?.type !== "diagram-deck") throw new Error("Fixture missing deck")
    deck.slides = []
    expect(() => validateDocument(value)).toThrow()
    const duplicate = document()
    duplicate.blocks.push(structuredClone(duplicate.blocks[0]))
    expect(() => validateDocument(duplicate)).toThrow("Duplicate block")
    const slideDuplicate = document()
    const slideDeck = slideDuplicate.blocks[0]
    if (slideDeck?.type !== "diagram-deck") throw new Error("Fixture missing deck")
    slideDeck.slides.push(structuredClone(slideDeck.slides[0]))
    expect(() => validateDocument(slideDuplicate)).toThrow("Duplicate slide")
    slideDeck.slides = Array.from({ length: 21 }, (_, i) => ({
      ...slideDeck.slides[0],
      id: `s${i}`,
    }))
    expect(() => validateDocument(slideDuplicate)).toThrow()
  })

  test("applies the document byte limit to standalone code", () => {
    expect(() =>
      validateDocument({
        ...document(),
        blocks: [
          { id: "snippet", type: "code", code: "中".repeat(Math.ceil(MAX_DOCUMENT_BYTES / 3)) },
        ],
      }),
    ).toThrow("bytes")
  })

  test("measures UTF-8 byte limits instead of only character counts", () => {
    expect(() =>
      validateDocument(document(drawing("中".repeat(Math.ceil(MAX_SVG_BYTES / 3))))),
    ).toThrow("exceeds 128 KiB")
    expect(() => validateDocument(document("a".repeat(MAX_SVG_BYTES + 1)))).toThrow()
    expect(() =>
      validateDocument({
        schemaVersion: 1,
        title: "Oversized",
        blocks: [
          {
            id: "text",
            type: "markdown",
            markdown: "中".repeat(Math.ceil(MAX_DOCUMENT_BYTES / 3)),
          },
        ],
      }),
    ).toThrow("bytes")
  })

  test("requires generated document IDs and complete update preconditions", () => {
    for (const id of ["../secret", "/tmp/file", "", "not-a-uuid", "a/b"]) {
      expect(() => validateDocumentId(id)).toThrow()
    }
    const id = "68c1f2bf-4715-4f75-9217-eec6279a7782"
    expect(() => validateDocumentId(id)).not.toThrow()
    expect(() => validateWriteInput({ document: document(), documentId: id })).toThrow("both")
    expect(() => validateWriteInput({ document: document(), expectedRevision: 1 })).toThrow("both")
    expect(() =>
      validateWriteInput({ document: document(), documentId: id, expectedRevision: 1 }),
    ).not.toThrow()
    expect(() =>
      validateWriteInput({ document: document(), documentId: id, expectedRevision: 0 }),
    ).toThrow()
  })
})
