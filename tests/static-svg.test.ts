import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { validateDocument } from "../src/document.js"
import { inspectStaticSvg, MAX_SVG_BYTES } from "../src/static-svg.js"

const drawing = (body: string, viewBox = "0 0 120 90") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`
const baseSlide = { id: "one", title: "One", explanationMarkdown: "First diagram." }

function deck(slides: unknown[], defaultDiagramSource?: string) {
  return {
    schemaVersion: 1,
    title: "Example",
    ...(defaultDiagramSource ? { defaultDiagramSource } : {}),
    blocks: [{ id: "deck", type: "diagram-deck", title: "Deck", slides }],
  }
}

test("accepts the three exported cache slides and preserves the exact document source", async () => {
  const value = JSON.parse(
    await readFile(
      new URL("../examples/diagram-design/http-cache-walkthrough.json", import.meta.url),
      "utf8",
    ),
  )
  const document = validateDocument(value)
  expect(document).toBe(value)
  expect(document.defaultDiagramSource).toBeUndefined()
  const block = document.blocks[1]
  if (block.type !== "diagram-deck") throw new Error("Missing cache deck")
  expect(block.slides).toHaveLength(3)
  for (const slide of block.slides) {
    if (!("svg" in slide)) throw new Error("Expected exported SVG")
    expect(inspectStaticSvg(slide.svg)).toEqual({ width: 960, height: 600 })
  }
})

test("retains old SVG books regardless of their ignored preference, but rejects retired slide fields", () => {
  const svg = drawing('<text x="10" y="20">快取</text>')
  for (const preference of ["mermaid", "diagram-design", undefined]) {
    const document = deck([{ ...baseSlide, svg }], preference)
    expect(validateDocument(document)).toBe(document)
  }
  expect(() => validateDocument(deck([{ ...baseSlide, svg, focusNodes: ["A"] }]))).toThrow(
    "Invalid sketchbook data",
  )
  expect(() => validateDocument(deck([baseSlide]))).toThrow("Invalid sketchbook data")
  expect(() => validateDocument(deck([{ ...baseSlide, svg }], "svg"))).toThrow(
    "Invalid sketchbook data",
  )
})

test.each(["", "0 0 0 10", "0 0 NaN 10", "0 0 40000 10", "0 0 1 1 1"])(
  "rejects unusable viewBox %j",
  (box) => {
    expect(() => inspectStaticSvg(drawing("", box))).toThrow("viewBox")
  },
)

test.each([
  ["non-SVG root", "<html/>"],
  ["malformed XML", drawing("<path>")],
  ["document type", `<!DOCTYPE svg>${drawing("")}`],
  ["processing instruction", `<?xml-stylesheet?>${drawing("")}`],
  ["unsupported element", drawing("<script/>")],
  ["unsupported attribute", drawing('<rect onload=" "/>')],
  ["namespace change", drawing('<g xmlns="http://example.invalid"/>')],
  ["animation", drawing('<rect style="transition: all 1s"/>')],
  ["embedded image", drawing("<image/>")],
  ["remote paint", drawing('<rect fill="url(https://example.invalid/paint.svg)"/>')],
  ["remote stylesheet", drawing('<style>@import "https://example.invalid/style.css";</style>')],
  [
    "remote CSS paint",
    drawing('<style>.station { fill: url("https://example.invalid/paint.svg") }</style>'),
  ],
  ["malformed CSS", drawing("<style>.station { ? }</style>")],
  ["oversized UTF-8", drawing(`<desc>${"圖".repeat(Math.floor(MAX_SVG_BYTES / 3))}</desc>`)],
])("rejects %s", (_name, svg) => {
  expect(() => inspectStaticSvg(svg)).toThrow("Invalid static SVG:")
})

test("accepts scoped styles, variables, and local definition references", () => {
  const svg = drawing(
    '<defs><style><![CDATA[.station { --ink: #333; fill: var(--ink) } @media print { .station { fill: #444 } }]]></style><marker id="arrow"/></defs><path class="station" marker-end="url(#arrow)"/>',
  )
  expect(inspectStaticSvg(svg)).toEqual({ width: 120, height: 90 })
})
