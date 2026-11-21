import { expect, test } from "@playwright/test"
import { asset, getDeck, readingMetrics, rendered, save, selectSlide } from "./helpers.js"

for (const width of [1280, 390]) {
  test(`focuses one region while preserving the overview at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const doc = await asset(request, "architecture-walkthrough")
    const model = getDeck(doc, "architecture-deck")
    const focusSlides = model.slides.slice(1)
    const repeated = { ...model.slides[model.slides.length - 1], id: "repeated-focus" }
    model.slides.push(repeated, {
      ...model.slides[1],
      id: "missing",
      focusNodes: ["Client", "Missing"],
    })
    await page.goto((await save(request, doc)).url)

    const deck = page.locator('[data-block-id="architecture-deck"]')
    const frame = deck.locator(".diagram-focus-frame")
    const svg = deck.locator(".diagram-svg > svg")
    const zoom = deck.getByRole("status", { name: "Current zoom" })
    await rendered(deck)
    await expect(frame).toHaveCount(0)
    const overview = await svg.elementHandle()
    const fitted = await zoom.textContent()
    const button = (name: string) => deck.getByRole("button", { name, exact: true })
    const overlap = (box: DOMRect, frame: DOMRect) =>
      box.left >= frame.left - 1 &&
      box.top >= frame.top - 1 &&
      box.right <= frame.right + 1 &&
      box.bottom <= frame.bottom + 1
    expect((await readingMetrics(deck)).minFontPx).toBeGreaterThanOrEqual(12)
    for (const slide of focusSlides) {
      await selectSlide(deck, slide.id)
      await expect(frame).toHaveCount(1)
      await expect(frame).toHaveAttribute("aria-hidden", "true")
      const targeted = await deck.evaluate((region) => {
        const box = region.querySelector(".diagram-focus-frame")?.getBoundingClientRect()
        if (!box) throw new Error("Missing focus frame")
        return [...region.querySelectorAll<SVGGElement>(".diagram-svg g.nodes > g[id]")].map(
          (node) => ({
            id: node.id.match(/flowchart-(.+)-\d+$/)?.[1],
            bounds: node.getBoundingClientRect().toJSON(),
            frame: box.toJSON(),
          }),
        )
      })
      expect(
        targeted
          .filter(({ bounds, frame }) => overlap(bounds, frame))
          .map(({ id }) => id)
          .sort(),
      ).toEqual([...(slide.focusNodes ?? [])].sort())
      expect(await svg.evaluate((node, original) => node === original, overview)).toBe(true)
      expect((await readingMetrics(deck)).minFontPx).toBeGreaterThanOrEqual(12)
      const focused = await zoom.textContent()
      expect(Number.parseInt(focused ?? "", 10)).toBeGreaterThan(Number.parseInt(fitted ?? "", 10))
      await button("Zoom out").click()
      expect(Number.parseInt((await zoom.textContent()) ?? "", 10)).toBeLessThan(
        Number.parseInt(focused ?? "", 10),
      )
      await button("Fit to screen").focus()
      await page.keyboard.press("Enter")
      await expect(zoom).toHaveText(fitted ?? "")
      await expect(frame).toHaveCount(1)
      const metric = await readingMetrics(deck)
      expect(metric.graphHeight).toBeLessThanOrEqual(metric.frameHeight)
      expect(metric.graphWidth).toBeLessThanOrEqual(metric.frameWidth)
      await button("Reset to slide focus").click()
      await expect(zoom).toHaveText(focused ?? "")
    }

    const focused = await zoom.textContent()
    await button("Fit to screen").click()
    await expect(zoom).toHaveText(fitted ?? "")
    await selectSlide(deck, repeated.id)
    await expect(zoom).toHaveText(focused ?? "")
    await expect(frame).toHaveCount(1)
    expect(await svg.evaluate((node, original) => node === original, overview)).toBe(true)

    await selectSlide(deck, "missing")
    await expect(frame).toHaveCount(0)
    await expect(deck.getByRole("status").filter({ hasText: "Could not find" })).toBeVisible()
    await expect(zoom).toHaveText(fitted ?? "")
    await selectSlide(deck, model.slides[0].id)
    await expect(frame).toHaveCount(0)
    await expect(deck.getByText("Could not find", { exact: false })).toHaveCount(0)
    await expect(zoom).toHaveText(fitted ?? "")
    await overview.dispose()
  })
}
