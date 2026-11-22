import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { validateStoredBook } from "../src/book.js"
import { validateDocument } from "../src/document.js"

test("the demo contains 51 ordered pages with a Diagram Design example on each", async () => {
  let nextPage = 1
  for (const [volume, count] of [
    [1, 26],
    [2, 25],
  ]) {
    const path = new URL(`../demo/atlas-volume-${volume}.json`, import.meta.url)
    const fixture = JSON.parse(await readFile(path, "utf8"))
    const document = validateDocument(fixture.document)
    const { chapters } = validateStoredBook({
      documentId: "08fd63fb-a491-486f-8367-b62c779979e1",
      revision: 1,
      updatedAt: "2025-01-01T00:00:00.000Z",
      sections: [],
      chapters: fixture.chapters,
    })
    const pages = [document, ...chapters]
    expect(pages).toHaveLength(count)
    for (const { title, blocks } of pages) {
      expect(title).toContain(`${String(nextPage++).padStart(2, "0")}｜`)
      expect(blocks.filter((block) => block.type === "diagram-html")).toHaveLength(1)
      expect(blocks.find((block) => block.id === "guide")).toMatchObject({
        type: "markdown",
        markdown: expect.stringContaining("## 案例"),
      })
    }
  }
})
