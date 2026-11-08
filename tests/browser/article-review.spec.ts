import { readFile, writeFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import { type SketchbookDocument, validateDocument } from "../../src/document.js"
import { captureArticle, readingMetrics, rendered, save, selectSlide } from "./helpers.js"

const fixtures = [
  {
    name: "architecture",
    path: new URL(
      "../../skills/sketchbook-explain-diagrams/assets/architecture-walkthrough.json",
      import.meta.url,
    ),
  },
  {
    name: "process",
    path: new URL(
      "../../skills/sketchbook-explain-diagrams/assets/process-walkthrough.json",
      import.meta.url,
    ),
  },
  { name: "agent-substrate", path: new URL("../fixtures/agent-substrate.json", import.meta.url) },
  { name: "viewer-handoff", path: new URL("../fixtures/viewer-handoff.json", import.meta.url) },
  { name: "receipt-check", path: new URL("../fixtures/receipt-check.json", import.meta.url) },
]

for (const fixture of fixtures) {
  for (const width of [390, 1440]) {
    test(`${fixture.name} complete article and every slide are readable at ${width}px`, async ({
      page,
      request,
    }, testInfo) => {
      test.setTimeout(60_000)
      const content: SketchbookDocument = validateDocument(
        JSON.parse(await readFile(fixture.path, "utf8")),
      )
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.message))
      const height = width === 390 ? 844 : 1000
      await page.setViewportSize({ width, height })
      await page.goto((await save(request, content)).url)
      await expect(page.locator("main h1")).toHaveCount(1)
      await expect(page.locator("main h1")).toHaveText(content.title)
      const initial = []
      for (const block of content.blocks) {
        if (block.type !== "diagram-deck") continue
        const deck = page.locator(`.deck[data-block-id="${block.id}"]`)
        await rendered(deck)
        await expect(deck.getByRole("button", { name: "More controls" })).toHaveAttribute(
          "aria-expanded",
          "false",
        )
        initial.push({
          blockId: block.id,
          slideId: block.slides[0].id,
          ...(await readingMetrics(deck)),
        })
      }
      await captureArticle(page, testInfo.outputPath("article-initial.png"))
      const chapters = await page.locator("main h2").allTextContents()
      if (fixture.name === "agent-substrate") {
        expect(chapters).toEqual(["入門", "運作方式", "安全隔離", "適用情境與限制", "參考資料"])
        await expect(page.locator('[data-block-id="intro"] table')).toHaveCount(0)
      }
      const evidence = []
      for (const block of content.blocks) {
        if (block.type !== "diagram-deck") continue
        const deck = page.locator(`.deck[data-block-id="${block.id}"]`)
        for (const slide of block.slides) {
          if (block.slides.length > 1) await selectSlide(deck, slide.id)
          await expect(deck).toHaveAttribute("data-slide-id", slide.id)
          await rendered(deck)
          await expect(deck.locator(".deck-heading h2")).toHaveText(block.title)
          await expect(deck.locator(".deck-heading h3")).toHaveText(slide.title)
          await expect(page.locator("main h2")).toHaveText(chapters)
          await expect(page.locator("main h1")).toHaveCount(1)
          await expect(page.getByRole("alert")).toHaveCount(0)
          await expect
            .poll(async () => (await readingMetrics(deck)).minFontPx)
            .toBeGreaterThanOrEqual(12)
          const metrics = await readingMetrics(deck)
          expect(metrics.labels).toBeGreaterThan(0)
          expect(metrics.graphWidth).toBeLessThanOrEqual(metrics.frameWidth + 1)
          expect(metrics.frameHeight - metrics.graphHeight).toBeLessThanOrEqual(64)
          expect(metrics.bodyFontPx).toBeGreaterThanOrEqual(16)
          expect(metrics.overflow).toBe(false)
          expect(metrics.heading).not.toBeNull()
          expect(metrics.toolbar).not.toBeNull()
          expect(metrics.explanation).not.toBeNull()
          if (block.slides.length > 1) expect(metrics.pagination).not.toBeNull()
          await expect(deck.locator(".diagram-svg > svg")).toHaveCount(1)
          await expect(deck.locator(".slide-explanation")).toHaveCount(1)
          const text = await page.locator(".markdown p, .markdown li").allTextContents()
          expect(text.filter((paragraph) => paragraph.includes("**"))).toEqual([])
          const screenshot = testInfo.outputPath(`${block.id}-${slide.id}.png`)
          await deck.screenshot({ path: screenshot })
          await testInfo.attach(`${block.id}/${slide.id}`, {
            path: screenshot,
            contentType: "image/png",
          })
          const codeScrolling = []
          for (const [index, pre] of (await page.locator("main .markdown pre").all()).entries()) {
            const original = await pre.textContent()
            const overflow = await pre.evaluate((node) => node.scrollWidth - node.clientWidth)
            if (overflow > 1) {
              await pre.evaluate((node) => {
                node.scrollLeft = node.scrollWidth
              })
              await expect
                .poll(() => pre.evaluate((node) => node.scrollLeft))
                .toBeGreaterThanOrEqual(overflow - 1)
              const codePath = testInfo.outputPath(`${block.id}-${slide.id}-code-${index}-end.png`)
              await pre.screenshot({ path: codePath })
              await testInfo.attach(`${slide.id}/code-${index}-end`, {
                path: codePath,
                contentType: "image/png",
              })
              await pre.evaluate((node) => {
                node.scrollLeft = 0
              })
            }
            await expect(pre).toHaveText(original ?? "")
            codeScrolling.push({ index, overflow, endReachable: true })
          }
          evidence.push({ blockId: block.id, slideId: slide.id, ...metrics, codeScrolling })
        }
      }
      expect(errors).toEqual([])
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await captureArticle(page, testInfo.outputPath("article-final.png"))
      const outline = await page
        .locator("main h1, main h2, main h3, main h4, main h5, main h6")
        .evaluateAll((headings) =>
          headings.map((heading) => ({ level: heading.tagName, text: heading.textContent })),
        )
      const path = testInfo.outputPath("article-review.json")
      await writeFile(
        path,
        JSON.stringify(
          {
            fixture: fixture.name,
            width,
            height,
            touch: false,
            chapters,
            outline,
            initial,
            evidence,
          },
          null,
          2,
        ),
      )
      await testInfo.attach("article-review", { path, contentType: "application/json" })
    })
  }
}
