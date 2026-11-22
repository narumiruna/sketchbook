import { expect, test } from "@playwright/test"
import { readingFixture } from "../fixtures/reading-layout.js"
import { captureArticle, readingMetrics, rendered, save, selectSlide } from "./helpers.js"

for (const width of [390, 900, 1024, 1440]) {
  test(`static diagram and explanation remain readable at ${width}px`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto((await save(request, readingFixture())).url)
    const deck = page.locator('[data-block-id="reading"]')
    for (const [id, nativeWidth] of [
      ["compact", 290],
      ["wide", 960],
      ["tall", 340],
    ] as const) {
      await selectSlide(deck, id)
      await rendered(deck)
      const { frame, graph, overflow, bodyFontPx } = await readingMetrics(deck)
      expect(overflow).toBe(false)
      expect(bodyFontPx).toBeGreaterThanOrEqual(16)
      expect(graph.width).toBe(nativeWidth)
      await expect(deck.locator(".slide-explanation")).toBeVisible()
      expect(frame.width).toBeLessThan(width)
      if (id === "wide" && width === 390) {
        const scroller = deck.locator(".static-diagram")
        await scroller.focus()
        await scroller.press("ArrowRight")
        await expect
          .poll(() => scroller.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0)
        await expect(deck).toHaveAttribute("data-slide-id", "wide")
      }
    }
    await captureArticle(page, testInfo.outputPath("article.png"))
  })
}
