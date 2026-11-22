import { describe, expect, test } from "vitest"
import {
  MAX_DOCUMENT_BYTES,
  MAX_MERMAID_BYTES,
  type SketchbookDocument,
  validateDocument,
  validateDocumentId,
  validateWriteInput,
} from "../src/document.js"

function document(source = "flowchart LR\n A[Start] --> B[Finish]"): SketchbookDocument {
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
            mermaid: source,
            explanationMarkdown: "Start to finish.",
          },
        ],
      },
    ],
  }
}

describe("document validation", () => {
  test("accepts the bounded contract and comments before flowchart", () => {
    const value = document("%% Architecture\nflowchart LR\n A[開始] --> B[Finish]")
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

  test("allows a focus region on a later slide that reuses the complete overview", () => {
    const value = document()
    const deck = value.blocks[0]
    if (deck?.type !== "diagram-deck") throw new Error("Fixture missing deck")
    const overview = deck.slides[0]
    if (!("mermaid" in overview)) throw new Error("Expected Mermaid fixture")
    const detail = { ...overview, id: "detail", focusNodes: ["A", "B"] }
    deck.slides.push(detail)
    expect(validateDocument(value)).toBe(value)
    detail.mermaid = "flowchart LR\n A[Start]"
    expect(() => validateDocument(value)).toThrow("reuse the first slide")
    deck.slides.pop()
    overview.focusNodes = ["A"]
    expect(() => validateDocument(value)).toThrow("reuse the first slide")
  })

  test.each(
    [[], ["A", "A"], ["#A"], ["客戶"], Array.from({ length: 13 }, (_, i) => `A${i}`)].map(
      (focusNodes) => ({ focusNodes }),
    ),
  )("rejects invalid focus node lists: $focusNodes", ({ focusNodes }) => {
    const value = document()
    const deck = value.blocks[0]
    if (deck?.type !== "diagram-deck") throw new Error("Fixture missing deck")
    deck.slides.push({ ...deck.slides[0], id: "detail", focusNodes })
    expect(() => validateDocument(value)).toThrow("Invalid sketchbook data")
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
    expect(() => validateDocument(document(`flowchart LR\n%%${"中".repeat(12000)}`))).toThrow(
      "bytes",
    )
    expect(() => validateDocument(document("a".repeat(MAX_MERMAID_BYTES + 1)))).toThrow()
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

  test("rejects focus on a later sequence slide with identical source", () => {
    const value = document("sequenceDiagram\n Client->>Server: Save")
    const deck = value.blocks[0]
    if (deck?.type !== "diagram-deck") throw new Error("Fixture missing deck")
    deck.slides.push({ ...deck.slides[0], id: "detail", focusNodes: ["Client"] })
    expect(() => validateDocument(value)).toThrow("only supported for flowchart")
  })

  test.each([
    "eventmodeling\n tf 01 evt Start",
    "architecture-beta\n service app(server)[Service]",
    "mindmap\n Root",
    "xychart-beta\n bar [1, 2]",
    "flowchart-elk LR\n A-->B",
    "flowchartJunk LR\n A-->B",
    "sequenceDiagram\n A->>B: Message\n link A: Reference @ /guide",
    "sequenceDiagram\n A->>B: Message\n links A: {}",
    "sequenceDiagram\n participant A@{ type: database }",
    'classDiagram\n class A\n link A "/guide"',
    "---\nconfig:\n look: classic\n---\nflowchart LR\n A-->B",
    "%%{init: {securityLevel: 'loose'}}%%\nflowchart LR\n A-->B",
    "flowchart LR\n A-->B\n click A callback",
    "flowchart LR; A-->B; click A callback",
    'flowchart LR\n A["<img src=x onerror=alert(1)>"]',
    'flowchart LR\n A["https://example.com"]',
    "flowchart LR\n classDef evil fill:url(//example.com/image)",
    "flowchart LR\n classDef evil @import 'bad.css'",
    'flowchart LR\n A@{ shape: image, img: "x" }',
    'flowchart LR\n A@{ shape: icon, icon: "fa:foo" }',
    "flowchart LR\n A[fa:fa-user]",
    'flowchart LR\n A@{ "img": "/assets/metadata-sentinel.svg" }',
    "flowchart LR\n A@{ 'img': '/assets/metadata-sentinel.svg' }",
    String.raw`flowchart LR
 A@{ "\u0069mg": "/assets/metadata-sentinel.svg" }`,
    'flowchart LR\n A@{ shape: "image", "img": "/assets/metadata-sentinel.svg" }',
    'flowchart LR\n A["`![image](/assets/metadata-sentinel.svg)`"]',
    "flowchart LR\n A@{ shape: rect }",
  ])("rejects unsupported or unsafe Mermaid: %s", (source) => {
    expect(() => validateDocument(document(source))).toThrow()
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
