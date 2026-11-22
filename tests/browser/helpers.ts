import { type APIRequestContext, expect, type Locator, type Page } from "@playwright/test"
import type { DiagramDeck, SketchbookDocument, StoredDocument } from "../../src/document.js"

import { drawing } from "../fixtures/static-drawing.js"

export function getDeck(document: SketchbookDocument, id: string): DiagramDeck {
  const block = document.blocks.find((block) => block.id === id)
  if (block?.type !== "diagram-deck") throw new Error(`Missing deck: ${id}`)
  return block
}

const coordinator = "http://127.0.0.1:4179"

export interface Fixture {
  stored: StoredDocument
  url: string
}

export async function save(
  request: APIRequestContext,
  document: SketchbookDocument,
  previous?: StoredDocument,
) {
  const response = await request.post(`${coordinator}/documents`, {
    data: {
      document,
      ...(previous ? { documentId: previous.documentId, expectedRevision: previous.revision } : {}),
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()) as Fixture
}

export function documentFixture(): SketchbookDocument {
  const deck = (id: string): DiagramDeck => ({
    id,
    type: "diagram-deck",
    title: `Deck ${id}`,
    slides: [
      {
        id: "overview",
        title: "Overview",
        svg: drawing("服務邊界 → 寫入"),
        explanationMarkdown: `Explanation ${id} overview with $x^2$.`,
      },
      {
        id: "detail",
        title: "Detail",
        svg: drawing(`Detail ${id} → Core`),
        explanationMarkdown: `Explanation ${id} detail.`,
      },
      {
        id: "end",
        title: "End",
        svg: drawing(`Core → End ${id}`),
        explanationMarkdown: `Explanation ${id} end.`,
      },
    ],
  })
  return {
    schemaVersion: 1,
    title: "Browser fixture",
    blocks: [
      {
        id: "intro",
        type: "markdown",
        markdown:
          "# Reading guide\n\nInline $a^2+b^2=c^2$.\n\n$$\nE=mc^2\n$$\n\n```typescript\nconst safe = true;\n```\n\n| Name | Value |\n| --- | --- |\n| revision | 1 |\n\n[Safe link](https://example.com/guide)",
      },
      deck("first"),
      { id: "between", type: "markdown", markdown: "Text between independent decks." },
      deck("second"),
      { id: "tail", type: "markdown", markdown: "Last text stays readable." },
    ],
  }
}

export async function rendered(deck: Locator) {
  const image = deck.locator(".static-diagram img")
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
}

export async function selectSlide(deck: Locator, id: string) {
  await deck.locator(`.slide-dot[data-slide-id="${id}"]`).click()
}

export async function readingMetrics(deck: Locator) {
  return deck.evaluate((element) => {
    const card = element.getBoundingClientRect()
    const box = (selector: string, required = true) => {
      const bounds = element.querySelector(selector)?.getBoundingClientRect()
      if (!bounds) {
        if (required) throw new Error(`Missing reading region: ${selector}`)
        return null
      }
      return {
        x: bounds.x - card.x,
        y: bounds.y - card.y,
        width: bounds.width,
        height: bounds.height,
      }
    }
    const frame = box(".static-diagram")
    const graph = box(".static-diagram img")
    const explanation = element.querySelector(".slide-explanation")
    if (!explanation) throw new Error("Missing slide explanation")
    if (!frame || !graph) throw new Error("Missing diagram geometry")
    return {
      heading: box(".deck-heading"),
      frame,
      graph,
      pagination: box(".slide-pagination", false),
      explanation: box(".slide-explanation"),
      firstParagraph: box(".slide-explanation p", false),
      bodyFontPx: Number.parseFloat(getComputedStyle(explanation).fontSize),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }
  })
}

export async function captureArticle(page: Page, path: string) {
  await page.evaluate(async () => {
    window.scrollTo(0, 0)
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  })
  const regions = await page.locator(".static-diagram").evaluateAll((frames) =>
    frames.map((frame) => {
      const bounds = frame.getBoundingClientRect()
      return {
        x: Math.floor(bounds.left + scrollX + 1),
        y: Math.floor(bounds.top + scrollY + 1),
        width: Math.floor(bounds.width - 2),
        height: Math.floor(bounds.height - 2),
      }
    }),
  )
  const capture = await page.screenshot({
    path,
    fullPage: true,
    scale: "css",
    animations: "disabled",
  })
  const painted = await page.evaluate(
    async ({ base64, regions }) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Cannot inspect article capture")
      context.drawImage(bitmap, 0, 0)
      const counts = regions.map(({ x, y, width, height }) => {
        const pixels = context.getImageData(x, y, width, height).data
        let count = 0
        for (let index = 0; index < pixels.length; index += 4) {
          if (Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 240) count++
        }
        return count
      })
      bitmap.close()
      return counts
    },
    { base64: capture.toString("base64"), regions },
  )
  for (const count of painted) {
    expect(count, "Every diagram must also paint in the complete-page capture").toBeGreaterThan(100)
  }
}
