import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { prepareDesignHtml } from "../src/design-html.js"
import { validateDocument } from "../src/document.js"

const inline =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>Diagram</text></svg>'
const html = (body = inline, head = "") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

test("keeps the original diagram HTML on write and preserves its layout on display", async () => {
  const original = await readFile(new URL("./fixtures/cache-design.html", import.meta.url), "utf8")
  const document = {
    schemaVersion: 1,
    title: "Book",
    defaultDiagramSource: "diagram-design",
    blocks: [{ id: "cache", type: "diagram-html", title: "Cache chapter", html: original }],
  }
  expect(validateDocument(document)).toBe(document)
  const safe = prepareDesignHtml(original)
  expect(safe).toContain("<figcaption>")
  expect(safe).toContain("304 NOT MODIFIED")
  expect(safe).toContain("default-src 'none'")
  expect(safe).not.toContain("fonts.googleapis.com")
})

test("validates implicit SVG namespaces without rewriting the HTML", () => {
  const implicit = inline.replace(' xmlns="http://www.w3.org/2000/svg"', "")
  expect(prepareDesignHtml(html(implicit))).toContain(implicit)
  expect(() => prepareDesignHtml(html(implicit.replace("<text>", '<text onclick="">')))).toThrow(
    "Invalid static SVG",
  )
})

test.each([
  ["non-document", inline],
  ["incorrect SVG namespace", html(inline.replace("http://www.w3.org/2000/svg", "urn:not-svg"))],
  ["no drawing", html("<p>Text</p>")],
  ["script", html(`${inline}<script></script>`)],
  ["event attribute", html(`<main onload="">${inline}</main>`)],
  ["metadata navigation", html(inline, '<meta http-equiv="refresh" content="0">')],
  [
    "authored font",
    html(inline, "<style>@font-face{font-family:Local;src:url(/assets/other.woff2)}</style>"),
  ],
  ["base URL", html(inline, '<base href="https://example.invalid/">')],
  ["network image", html(`${inline}<img src="https://example.invalid/picture">`)],
  ["network CSS", html(inline, "<style>p{background:url(https://example.invalid/paint)}</style>")],
  ["active embed", html(`${inline}<iframe></iframe>`)],
  ["SVG link", html(inline.replace("</svg>", "<a></a></svg>"))],
  ["invalid SVG", html(inline.replace('viewBox="0 0 100 100"', 'viewBox="0 0 0 0"'))],
  ["oversized UTF-8", html(`${inline}<p>${"圖".repeat(44000)}</p>`)],
])("rejects %s", (_name, source) => {
  expect(() => prepareDesignHtml(source)).toThrow(/Invalid (?:Diagram Design HTML|static SVG):/)
})
