import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { type Browser, chromium } from "@playwright/test"
import { ViewerServer } from "../src/server.js"
import { DocumentStore } from "../src/store.js"
import { readingFixture } from "../tests/fixtures/reading-layout.js"

// Capture the same teaching content against the currently built Viewer.
// Never store its temporary capability URL or use a user's document directory.
const output = resolve("test-results/reading-layout", process.argv[2] ?? "after")
await mkdir(output, { recursive: true })
const workspace = await mkdtemp(join(tmpdir(), "sketchbook-reading-"))
const store = new DocumentStore(workspace)
const viewer = new ViewerServer(store, new URL("../dist/web/", import.meta.url))
let browser: Browser | undefined
const report = []
try {
  browser = await chromium.launch()
  const { stored } = await store.write({ document: readingFixture() })
  const url = await viewer.open(stored.documentId)
  for (const config of [
    { width: 1440, height: 1000, touch: false },
    { width: 1280, height: 960, touch: false },
    { width: 390, height: 844, touch: false },
    { width: 390, height: 844, touch: true },
  ]) {
    const page = await browser.newPage({
      viewport: { width: config.width, height: config.height },
      hasTouch: config.touch,
      isMobile: config.touch,
    })
    await page.goto(url)
    const deck = page.locator('[data-block-id="reading"]')
    const prefix = `${config.width}${config.touch ? "-touch" : ""}`
    for (const slide of ["compact", "wide", "tall"]) {
      await deck.locator(`button[data-slide-id="${slide}"]`).click()
      await deck.locator('.diagram[aria-busy="false"] .diagram-svg > svg').waitFor()
      await page.evaluate(async () => {
        await document.fonts.ready
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      })
      const metrics = await deck.evaluate((element) => {
        const card = element.getBoundingClientRect()
        const rects = Object.fromEntries(
          [
            ["heading", ".deck-heading"],
            ["toolbar", ".diagram-controls"],
            ["frame", ".diagram-viewport"],
            ["graph", ".diagram-svg > svg"],
            ["pagination", ".slide-pagination"],
            ["explanation", ".slide-explanation"],
            ["firstParagraph", ".slide-explanation p"],
          ].map(([key, selector]) => {
            const box = element.querySelector(selector)?.getBoundingClientRect()
            if (!box) throw new Error(`Missing ${selector}`)
            return [
              key,
              { x: box.x - card.x, y: box.y - card.y, width: box.width, height: box.height },
            ]
          }),
        )
        const fonts = [...element.querySelectorAll<SVGTextElement>(".diagram-svg text")]
          .filter((label) => label.textContent?.trim())
          .map((label) => {
            const matrix = label.getScreenCTM()
            if (!matrix) throw new Error("Missing diagram transform")
            return (
              Number.parseFloat(getComputedStyle(label).fontSize) * Math.hypot(matrix.a, matrix.b)
            )
          })
        const paragraph = element.querySelector(".slide-explanation p")
        if (!paragraph) throw new Error("Missing explanation")
        return {
          ...rects,
          lineHeight: Number.parseFloat(getComputedStyle(paragraph).lineHeight),
          minFontPx: Math.min(...fonts),
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
      report.push({ ...config, slide, ...metrics })
      await deck.screenshot({
        path: join(output, `${prefix}-${slide}.jpg`),
        type: "jpeg",
        quality: 85,
      })
      if (slide === "compact") {
        await page.screenshot({
          path: join(output, `${prefix}-article.jpg`),
          fullPage: true,
          type: "jpeg",
          quality: 85,
        })
      }
    }
    await page.close()
  }
  await writeFile(join(output, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Captured ${report.length} reading views at ${output}; no capability URLs retained.`)
} finally {
  try {
    await browser?.close()
  } finally {
    try {
      await viewer.close()
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  }
}
