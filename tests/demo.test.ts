import { readFile } from "node:fs/promises"
import { expect, test } from "vitest"
import { validateStoredBook } from "../src/book.js"
import { validateDocument } from "../src/document.js"

async function readVolume(volume: number) {
  const path = new URL(`../demo/atlas-volume-${volume}.json`, import.meta.url)
  return JSON.parse(await readFile(path, "utf8"))
}

test("the demo contains 51 ordered pages with a Diagram Design example on each", async () => {
  let nextPage = 1
  for (const [volume, count] of [
    [1, 26],
    [2, 25],
  ]) {
    const fixture = await readVolume(volume)
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

async function chart(volume: number, chapterId: string): Promise<string> {
  const { chapters } = await readVolume(volume)
  const { chapters: validated } = validateStoredBook({
    documentId: "08fd63fb-a491-486f-8367-b62c779979e1",
    revision: 1,
    updatedAt: "2025-01-01T00:00:00.000Z",
    sections: [],
    chapters,
  })
  const drawing = validated
    .find((chapter) => chapter.id === chapterId)
    ?.blocks.find((block) => block.type === "diagram-html")
  if (!drawing) throw new Error(`Missing chart: ${chapterId}`)
  return drawing.html
}

test("the timeline uses one month scale for event labels and the January tick", async () => {
  const svg = await chart(1, "timeline")
  const labels = [
    ...svg.matchAll(/<text x="([\d.]+)"[^>]*>(JAN '26|(?:FEB|APR|SEP|JAN) 202[56])<\/text>/g),
  ]
  const positions = new Map(labels.map(([, x, label]) => [label, Number(x)]))
  const start = positions.get("FEB 2025") ?? NaN
  const step = ((positions.get("APR 2026") ?? NaN) - start) / 14
  expect(step).toBeGreaterThan(0)
  expect(positions.get("APR 2025")).toBeCloseTo(start + 2 * step, 2)
  expect(positions.get("SEP 2025")).toBeCloseTo(start + 7 * step, 2)
  expect(positions.get("JAN 2026")).toBeCloseTo(start + 11 * step, 2)
  expect(positions.get("JAN '26")).toBe(positions.get("JAN 2026"))
})

test("the Gantt axis labels all twelve week starts", async () => {
  const svg = await chart(2, "gantt")
  const labels = [...svg.matchAll(/<text x="(\d+)" y="70">W(\d+)<\/text>/g)]
  expect(labels.map(([, , week]) => Number(week))).toEqual(
    Array.from({ length: 12 }, (_, i) => i + 1),
  )
  for (const [, x] of labels) {
    expect(svg).toMatch(new RegExp(`<line x1="${x}"[^>]* x2="${x}" y2="416"`))
  }
})

test("the scatter plot identifies Platform without ranking it first", async () => {
  const svg = await chart(2, "scatter")
  expect(svg).toContain("Platform · highlighted team")
  expect(svg).toContain("Another team has 20 deploys per week and two days of lead time.")
  expect(svg).not.toContain("best performer")
})
