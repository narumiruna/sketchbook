import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { prepareDesignHtml } from "../src/design-html.js"

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

test("the Sketchbook skill includes the complete Diagram Design authoring workflow", async () => {
  const [skill, format] = await Promise.all([
    read("skills/sketchbook/SKILL.md"),
    read("skills/sketchbook/references/document-format.md"),
  ])
  expect(skill).toMatch(/^---\nname: sketchbook\ndescription: [^\n]+\nlicense: MIT\n---/)
  for (const step of [
    "upstream/GUIDE.md",
    "references/document-format.md",
    "diagram-html",
    "sketchbook_write",
    "sketchbook_edit",
    "sketchbook_read_book",
    "sketchbook_open",
    "390px",
  ])
    expect(skill).toContain(step)
  expect(skill).not.toMatch(/mermaid|focusNodes|defaultDiagramSource/i)
  expect(format).toContain("### Diagram Design HTML")
  expect(format).toContain("### Static SVG policy")
  expect(format).not.toMatch(/mermaid|focusNodes/i)
})

test("the cache test fixture is valid standalone HTML and introduces each case before the complete decision flow", async () => {
  const html = await read("tests/fixtures/cache-design.html")
  expect(() => prepareDesignHtml(html)).not.toThrow()
  expect(
    [...html.matchAll(/<section aria-labelledby="([^"]+)"/g)].map((match) => match[1]),
  ).toEqual(["fresh-heading", "validate-heading", "decide-heading"])
})
