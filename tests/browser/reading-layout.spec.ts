import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { expect, type Locator, test } from "@playwright/test"
import { readingFixture } from "../fixtures/reading-layout.js"
import { captureArticle, getDeck, readingMetrics, rendered, save, selectSlide } from "./helpers.js"

for (const { width, fontSize, stacked } of [
  { width: 900, fontSize: 16, stacked: true },
  { width: 1024, fontSize: 16, stacked: false },
  { width: 1024, fontSize: 20, stacked: true },
  { width: 1440, fontSize: 20, stacked: true },
]) {
  test(`reading columns fit available width at ${width}px with ${fontSize}px root text`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto((await save(request, readingFixture())).url)
    await page.addStyleTag({ content: `:root { font-size: ${fontSize}px; }` })
    const deck = page.locator('[data-block-id="reading"]')
    await rendered(deck)
    await expect.poll(async () => (await readingMetrics(deck)).overflow).toBe(false)
    await expect
      .poll(async () => {
        const { frame, explanation, pagination } = await readingMetrics(deck)
        if (!explanation || !pagination) throw new Error("Missing reading regions")
        return (
          explanation.y >= pagination.y + pagination.height - 1 &&
          explanation.x < frame.x + frame.width
        )
      })
      .toBe(stacked)
    const { frame, graph } = await readingMetrics(deck)
    expect(graph.width).toBeLessThanOrEqual(frame.width + 1)
    await expect(deck.locator(".slide-explanation p").first()).toBeVisible()
  })
}

const baseline = JSON.parse(
  await readFile(new URL("../fixtures/reading-layout-baseline.json", import.meta.url), "utf8"),
) as {
  sourceRevision: string
  fixtureSha256: string
  measurements: Array<{
    width: number
    height: number
    touch: boolean
    slide: string
    firstParagraph: { y: number }
    heading: { height: number }
    frame: { height: number; width: number }
    lineHeight: number
    minFontPx: number
  }>
}

// Historical layout constants from 348c400, independent of current Viewer CSS.
// Only system-font glyph metrics and the unchanged source SVG are browser-specific.
async function historicalCompactBaseline(
  deck: Locator,
  before: (typeof baseline.measurements)[number],
) {
  const reference = await deck.evaluate(
    (element, previous) => {
      const current = element.querySelector<HTMLElement>(".deck-heading")
      const svg = element.querySelector<SVGSVGElement>(".diagram-svg > svg")
      if (!current || !svg) throw new Error("Missing baseline inputs")
      // A shadow root prevents current heading/descendant rules from changing
      // the reference. Construct historical markup rather than cloning styles.
      const host = document.createElement("div")
      host.setAttribute("aria-hidden", "true")
      host.style.cssText = `all: initial; display: block; position: absolute; visibility: hidden; width: ${previous.width}px;`
      const shadow = host.attachShadow({ mode: "closed" })
      const style = document.createElement("style")
      style.textContent = `
        * { box-sizing: border-box; margin: 0; padding: 0; border: 0; }
        header { display: flex; align-items: center; justify-content: space-between;
          gap: 16px; padding: ${previous.width <= 600 ? "13.6px" : "16px 20px"};
          border-bottom: 1px solid transparent; font: 16px/25.6px system-ui, sans-serif; }
        div { min-width: 0; }
        h2, h3 { font-weight: 700; overflow-wrap: break-word; }
        h2 { font-size: 21.6px; line-height: 27px; }
        h3 { font-size: 17.6px; line-height: 22px; margin-top: 5.6px; }
        span { flex-shrink: 0; padding: 3.2px 9.6px; border: 1px solid transparent;
          font-size: 11.2px; line-height: 17.92px; }
      `
      const legacy = document.createElement("header")
      const titles = document.createElement("div")
      for (const tag of ["h2", "h3"]) {
        const title = document.createElement(tag)
        title.textContent = current.querySelector(tag)?.textContent ?? ""
        titles.append(title)
      }
      const badge = document.createElement("span")
      badge.textContent = "Mermaid"
      legacy.append(titles, badge)
      shadow.append(style, legacy)
      element.append(host)
      let headingHeight: number
      try {
        headingHeight = legacy.getBoundingClientRect().height
      } finally {
        host.remove()
      }
      const natural = svg.viewBox.baseVal
      const inlineScale = Math.min(1, (previous.width - 32) / natural.width)
      const limit = Math.max(240, Math.min(previous.height * 0.7, 576))
      const frameHeight = Math.max(96, Math.min(natural.height * inlineScale + 32, limit))
      return { headingHeight, frameHeight }
    },
    { width: before.frame.width, height: before.height },
  )
  return {
    ...reference,
    firstParagraphY:
      before.firstParagraph.y +
      (reference.headingHeight - before.heading.height) +
      (reference.frameHeight - before.frame.height),
  }
}

test("historical comparison detects added heading padding and frame whitespace", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto((await save(request, readingFixture())).url)
  const deck = page.locator('[data-block-id="reading"]')
  await rendered(deck)
  const before = baseline.measurements.find((item) => item.width === 390 && !item.touch)
  if (!before) throw new Error("Missing mobile reference")
  const reference = await historicalCompactBaseline(deck, before)
  const threshold = reference.firstParagraphY - before.lineHeight + 0.5
  expect((await readingMetrics(deck)).firstParagraph?.y).toBeLessThanOrEqual(threshold)
  for (const css of [
    ".deck-heading { padding-top: calc(0.85rem + 8px); padding-bottom: calc(0.85rem + 8px); }",
    ".deck-heading h2 { padding-block: 8px; }",
    ".deck-heading h3 { border-block: 8px solid transparent; }",
    `.diagram-viewport { height: ${(await readingMetrics(deck)).frame.height + 16}px !important; }`,
  ]) {
    const override = await page.addStyleTag({ content: css })
    const unchanged = await historicalCompactBaseline(deck, before)
    expect(unchanged.firstParagraphY).toBeCloseTo(reference.firstParagraphY, 2)
    await expect
      .poll(async () => (await readingMetrics(deck)).firstParagraph?.y)
      .toBeGreaterThan(threshold)
    await override.evaluate((node) => {
      node.parentNode?.removeChild(node)
    })
  }
})

for (const viewport of [
  { width: 1440, height: 1000, touch: false },
  { width: 1280, height: 960, touch: false },
  { width: 390, height: 844, touch: false },
  { width: 390, height: 844, touch: true },
]) {
  test.describe(`reading layout ${viewport.width}x${viewport.height}, touch=${viewport.touch}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch,
      isMobile: viewport.touch,
    })

    test("compact reading improves without smaller labels; wide and tall graphs stay contained", async ({
      page,
      request,
    }, testInfo) => {
      const content = readingFixture()
      expect(createHash("sha256").update(JSON.stringify(content)).digest("hex")).toBe(
        baseline.fixtureSha256,
      )
      const authored = getDeck(content, "reading")
      await page.goto((await save(request, content)).url)
      const deck = page.locator('[data-block-id="reading"]')
      await rendered(deck)
      await captureArticle(page, testInfo.outputPath("article-initial.png"))
      const before = baseline.measurements.find(
        (measurement) =>
          measurement.width === viewport.width &&
          measurement.height === viewport.height &&
          measurement.touch === viewport.touch &&
          measurement.slide === "compact",
      )
      if (!before) throw new Error("Missing controlled reading baseline")
      expect(baseline.sourceRevision).toBe("348c400")
      const reference = await historicalCompactBaseline(deck, before)
      const evidence = []
      for (const slide of authored.slides) {
        await selectSlide(deck, slide.id)
        await rendered(deck)
        await expect(deck.locator(".deck-heading h2")).toHaveText(authored.title)
        await expect(deck.locator(".deck-heading h3")).toHaveText(slide.title)
        await expect(deck.locator(".diagram")).toHaveCount(1)
        await expect(deck.locator(".diagram-svg > svg")).toHaveCount(1)
        await expect(deck.locator(".slide-explanation")).toHaveCount(1)
        await expect(deck.locator(".diagram-secondary-controls")).toBeHidden()
        await expect(deck.getByRole("alert")).toHaveCount(0)
        if (viewport.width <= 600) {
          await expect(deck.locator(".deck-kind")).toBeHidden()
          await expect(deck.locator(".diagram-pan-hint")).toBeHidden()
        }
        const metrics = await readingMetrics(deck)
        const { frame, graph, explanation, pagination, firstParagraph } = metrics
        if (!explanation || !pagination || !firstParagraph)
          throw new Error("Missing reading composition")
        expect(metrics.overflow).toBe(false)
        expect(metrics.bodyFontPx).toBeGreaterThanOrEqual(16)
        expect(metrics.labels).toBeGreaterThan(0)
        expect(metrics.minFontPx).toBeGreaterThan(0)
        expect(frame.height).toBeLessThanOrEqual(576)
        expect(graph.x).toBeGreaterThanOrEqual(frame.x - 1)
        expect(graph.y).toBeGreaterThanOrEqual(frame.y - 1)
        expect(graph.x + graph.width).toBeLessThanOrEqual(frame.x + frame.width + 1)
        expect(graph.y + graph.height).toBeLessThanOrEqual(frame.y + frame.height + 1)
        expect(pagination.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1)
        if (viewport.width >= 1024) {
          expect(explanation.x).toBeGreaterThanOrEqual(frame.x + frame.width - 1)
          expect(explanation.y).toBeLessThan(frame.y + frame.height)
          expect(pagination.x + pagination.width).toBeLessThanOrEqual(explanation.x + 1)
        } else {
          expect(explanation.y).toBeGreaterThanOrEqual(pagination.y + pagination.height - 1)
          expect(explanation.x).toBeGreaterThanOrEqual(frame.x)
          expect(explanation.x + explanation.width).toBeLessThanOrEqual(frame.x + frame.width)
        }
        const clippedHeadings = await deck
          .locator(".deck-heading h2, .deck-heading h3")
          .evaluateAll((nodes) =>
            nodes.some((node) => {
              const style = getComputedStyle(node)
              return (
                style.textOverflow === "ellipsis" ||
                node.scrollHeight > node.clientHeight + 1 ||
                node.scrollWidth > node.clientWidth + 1
              )
            }),
          )
        expect(clippedHeadings).toBe(false)
        const paragraphs = slide.explanationMarkdown
          .split("\n\n")
          .filter((paragraph) => !paragraph.startsWith("```"))
        await expect(deck.locator(".slide-explanation p")).toHaveText(paragraphs)
        for (const paragraph of await deck.locator(".slide-explanation p").all())
          await expect(paragraph).toBeVisible()
        const code = /```typescript\n([\s\S]*?)\n```/.exec(slide.explanationMarkdown)?.[1]
        if (code) await expect(deck.locator(".slide-explanation pre code")).toHaveText(`${code}\n`)
        let sameFontBaselineOffsetPx: number | null = null
        if (slide.id === "compact") {
          expect(metrics.minFontPx).toBeGreaterThanOrEqual(12)
          // The same authored content must improve composition, not shrink labels.
          expect(metrics.minFontPx).toBeGreaterThanOrEqual(before.minFontPx - 0.05)
          if (viewport.width === 390) {
            // The camera/source is unchanged, but system-font SVG geometry is not
            // identical on macOS and Linux. Compare the same content/font, not
            // Linux output against an absolute macOS pixel coordinate.
            expect(frame.width).toBe(before.frame.width)
            sameFontBaselineOffsetPx = reference.firstParagraphY
            expect(firstParagraph.y).toBeLessThanOrEqual(
              sameFontBaselineOffsetPx - before.lineHeight + 0.5,
            )
          }
        }
        const path = testInfo.outputPath(`reading-${slide.id}.png`)
        await deck.screenshot({ path })
        await testInfo.attach(slide.id, { path, contentType: "image/png" })
        evidence.push({
          slide: slide.id,
          ...metrics,
          ...(slide.id === "compact"
            ? {
                explanationStartChangePx: firstParagraph.y - before.firstParagraph.y,
                sameFontBaselineOffsetPx,
                sameFontExplanationChangePx:
                  sameFontBaselineOffsetPx === null
                    ? null
                    : firstParagraph.y - sameFontBaselineOffsetPx,
                fittedLabelChangePx: metrics.minFontPx - before.minFontPx,
              }
            : {}),
        })
      }
      await captureArticle(page, testInfo.outputPath("article-final.png"))
      const path = testInfo.outputPath("reading-layout.json")
      await writeFile(
        path,
        JSON.stringify(
          {
            fixture: "readingFixture",
            ...viewport,
            sourceRevision: baseline.sourceRevision,
            baseline: before,
            reference,
            baselineCalibration:
              "Frozen historical heading styles and frame inset/clamp formula with same-browser system font and intrinsic SVG geometry",
            evidence,
          },
          null,
          2,
        ),
      )
      await testInfo.attach("reading-layout", { path, contentType: "application/json" })
    })

    if (viewport.touch) {
      test("touch help describes controls and article scrolling, not unsupported camera gestures", async ({
        page,
        request,
        context,
      }) => {
        await page.addInitScript(() => {
          Element.prototype.requestFullscreen = () =>
            Promise.reject(new Error("Denied for touch test"))
        })
        await page.goto((await save(request, readingFixture())).url)
        const deck = page.locator('[data-block-id="reading"]')
        await rendered(deck)
        const disclosure = deck.getByRole("button", { name: "More controls" })
        const frame = deck.locator(".diagram-viewport")
        const help = deck.locator(".diagram-pan-hint")
        expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true)
        await expect(help).toBeHidden()
        await expect(frame).toHaveAccessibleName("Interactive diagram")
        await expect(frame).toHaveAccessibleDescription(/controls.*zoom.*scroll/i)
        await expect(frame).not.toHaveAccessibleDescription(/pan|pinch|wheel|drag/i)
        await disclosure.tap()
        await expect(disclosure).toHaveAttribute("aria-expanded", "true")
        await expect(help).toBeVisible()
        await expect(help).toContainText(/controls.*zoom.*scroll/i)
        await expect(help).not.toContainText(/pan|pinch|wheel|drag/i)
        await expect(deck.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible()
        await disclosure.tap()
        await frame.scrollIntoViewIfNeeded()
        expect(await frame.evaluate((node) => getComputedStyle(node).touchAction)).toBe("pan-y")
        const stage = deck.locator(".diagram-svg")
        const camera = await stage.getAttribute("style")
        const scroll = await page.evaluate(() => scrollY)
        const box = await frame.boundingBox()
        if (!box) throw new Error("Missing touch diagram")
        const client = await context.newCDPSession(page)
        const x = box.x + box.width / 2
        const y = box.y + box.height - 20
        await client.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        })
        for (let step = 1; step <= 8; step++) {
          await client.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: y - step * 18 }],
          })
          await page.waitForTimeout(16)
        }
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await client.detach()
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll + 40)
        await expect(stage).toHaveAttribute("style", camera ?? "")
        await deck.getByRole("button", { name: "Fullscreen", exact: true }).tap()
        await expect(page.getByRole("dialog")).toBeVisible()
        await expect(disclosure).toHaveAttribute("aria-expanded", "false")
        await disclosure.tap()
        await expect(help).toBeVisible()
        await expect(help).toContainText(/controls.*zoom.*exit fullscreen.*scroll/i)
        await expect(frame).toHaveAccessibleDescription(/controls.*zoom.*exit fullscreen.*scroll/i)
        await expect(frame).not.toHaveAccessibleDescription(/pan|pinch|wheel|drag/i)
        await deck.getByRole("button", { name: "Exit fullscreen", exact: true }).tap()
        await expect(page.getByRole("dialog")).toHaveCount(0)
      })
    }
  })
}
