import { type APIRequestContext, expect, type Locator, type Page } from "@playwright/test"
import type { DiagramDeck, SketchbookDocument, StoredDocument } from "../../src/document.js"

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

export async function asset(request: APIRequestContext, name: string) {
  const response = await request.get(`${coordinator}/assets/${name}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as SketchbookDocument
}

export const source = `flowchart LR
  subgraph Service["服務邊界"]
    A["讀取文件 — a deliberately long label for responsive SVG rendering"] --> B["寫入"]
  end
  classDef important fill:#ddeeef,stroke:#246;
  class A important;
  linkStyle 0 stroke:#246,stroke-width:2px;`

export function documentFixture(): SketchbookDocument {
  const deck = (id: string): DiagramDeck => ({
    id,
    type: "diagram-deck",
    title: `Deck ${id}`,
    slides: [
      {
        id: "overview",
        title: "Overview",
        mermaid: source,
        explanationMarkdown: `Explanation ${id} overview with $x^2$.`,
      },
      {
        id: "detail",
        title: "Detail",
        mermaid: `flowchart LR\n A["Detail ${id}"] --> C["Core"]`,
        explanationMarkdown: `Explanation ${id} detail.`,
      },
      {
        id: "end",
        title: "End",
        mermaid: `flowchart LR\n C["Core"] --> Z["End ${id}"]`,
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
  await expect(deck.locator(".diagram")).toHaveAttribute("aria-busy", "false")
  await expect(deck.locator(".diagram-svg > svg")).toBeVisible()
}

export async function openDiagramControls(deck: Locator) {
  const disclosure = deck.getByRole("button", { name: "More controls", exact: true })
  if ((await disclosure.getAttribute("aria-expanded")) === "false") await disclosure.click()
  await expect(disclosure).toHaveAttribute("aria-expanded", "true")
  await expect(deck.locator(".diagram-secondary-controls")).toBeVisible()
}

export async function selectSlide(deck: Locator, id: string) {
  await deck.locator(`.slide-dot[data-slide-id="${id}"]`).click()
}

export function getDeck(document: SketchbookDocument, id: string) {
  const block = document.blocks.find((block) => block.id === id)
  if (block?.type !== "diagram-deck") throw new Error(`Missing fixture deck ${id}`)
  return block
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
    const svg = element.querySelector<SVGSVGElement>(".diagram-svg > svg")
    const paragraph = element.querySelector(".slide-explanation p")
    const explanation = element.querySelector(".slide-explanation")
    if (!svg || !explanation) throw new Error("Missing rendered slide")
    const fonts = [...svg.querySelectorAll("text")]
      .filter((label) => label.textContent?.trim())
      .map((label) => {
        const matrix = label.getScreenCTM()
        return (
          Number.parseFloat(getComputedStyle(label).fontSize) *
          Math.hypot(matrix?.a ?? 0, matrix?.b ?? 0)
        )
      })
    const frame = box(".diagram-viewport")
    const graph = box(".diagram-svg > svg")
    if (!frame || !graph) throw new Error("Missing diagram geometry")
    return {
      heading: box(".deck-heading"),
      toolbar: box(".diagram-controls"),
      frame,
      graph,
      pagination: box(".slide-pagination", false),
      explanation: box(".slide-explanation"),
      firstParagraph: box(".slide-explanation p", false),
      lineHeight: paragraph ? Number.parseFloat(getComputedStyle(paragraph).lineHeight) : null,
      bodyFontPx: Number.parseFloat(getComputedStyle(explanation).fontSize),
      labels: fonts.length,
      minFontPx: Math.min(...fonts),
      maxFontPx: Math.max(...fonts),
      frameHeight: frame.height,
      graphHeight: graph.height,
      frameWidth: frame.width,
      graphWidth: graph.width,
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
  const regions = await page.locator(".diagram-viewport").evaluateAll((frames) =>
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
