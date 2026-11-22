import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { prepareDesignHtml } from "../src/design-html.js"

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

test("the public skill routes directly to packaged Diagram Design HTML", async () => {
  const [skill, design, format] = await Promise.all([
    read("skills/sketchbook-create-diagrams/SKILL.md"),
    read("skills/sketchbook-diagram-design/SKILL.md"),
    read("skills/sketchbook-create-diagrams/references/document-format.md"),
  ])
  expect(skill).toMatch(/^---\nname: sketchbook-create-diagrams\ndescription: [^\n]+\n---/)
  for (const route of [
    "sketchbook-diagram-design",
    "diagram-html",
    "sketchbook_write",
    "sketchbook_edit",
    "sketchbook_open",
    "390px",
  ])
    expect(skill).toContain(route)
  expect(skill).not.toMatch(/mermaid|focusNodes|defaultDiagramSource/i)
  expect(design).toContain("upstream/GUIDE.md")
  expect(format).toContain("### Diagram Design HTML")
  expect(format).toContain("### Static SVG policy")
  expect(format).not.toMatch(/mermaid|focusNodes/i)
})

test("the cache example is valid standalone HTML and introduces each case before the complete decision flow", async () => {
  const html = await read("examples/diagram-design/http-cache.html")
  expect(() => prepareDesignHtml(html)).not.toThrow()
  expect(
    [...html.matchAll(/<section aria-labelledby="([^"]+)"/g)].map((match) => match[1]),
  ).toEqual(["fresh-heading", "validate-heading", "decide-heading"])
})
