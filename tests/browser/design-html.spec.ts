import { readFile } from "node:fs/promises"
import { expect, type Page, test } from "@playwright/test"
import { save } from "./helpers.js"

const source = () => readFile(new URL("../fixtures/cache-design.html", import.meta.url), "utf8")

test("viewport-dependent HTML does not grow the frame or hide its overflow", async ({
  page,
  request,
}) => {
  const fixture = await save(request, {
    schemaVersion: 1,
    title: "Viewport-dependent book",
    blocks: [
      {
        type: "diagram-html",
        id: "viewport-height",
        title: "Viewport-height drawing",
        html: `<!doctype html><html><head><style>main{min-height:100vh}</style></head><body><main><svg viewBox="0 0 100 50" width="100" height="50"><text y="20">Drawing</text></svg></main><p>End of design page</p></body></html>`,
      },
      { type: "markdown", id: "next", markdown: "Next book block" },
    ],
  })
  await page.goto(fixture.url)
  const frame = page.locator('iframe[title="Viewport-height drawing"]')
  await expect(frame.contentFrame().getByText("Drawing")).toBeVisible()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 })
    const heights = await frame.evaluate(async (element) => {
      const results = []
      for (let i = 0; i < 16; i++) {
        await new Promise(requestAnimationFrame)
        results.push(element.getBoundingClientRect().height)
      }
      return results.slice(3)
    })
    expect(new Set(heights).size).toBe(1)
    expect(heights[0]).toBeGreaterThan(50)
    expect(heights[0]).toBeLessThan(400)
    await expect(page.getByText("Next book block")).toBeInViewport()
    const end = frame.contentFrame().getByText("End of design page")
    await end.scrollIntoViewIfNeeded()
    await expect(end).toBeInViewport()
  }
})

async function usedFonts(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send("DOM.enable")
    await cdp.send("CSS.enable")
    const { root } = await cdp.send("DOM.getDocument")
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: ".design-page",
    })
    const { node } = await cdp.send("DOM.describeNode", { nodeId, depth: 1 })
    if (!node.contentDocument) throw new Error("Missing Diagram Design frame")
    const names = async (parent: number, selector: string) => {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: parent, selector })
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId })
      return fonts
        .filter((font) => font.isCustomFont && font.glyphCount > 0)
        .map((font) => font.familyName)
        .join(", ")
    }
    return {
      chapter: await names(root.nodeId, "main h1"),
      index: await names(root.nodeId, ".contents-chapter[aria-current]"),
      title: await names(node.contentDocument.nodeId, "h1"),
      caption: await names(node.contentDocument.nodeId, "figcaption"),
    }
  } finally {
    await cdp.detach()
  }
}

for (const width of [390, 1280]) {
  test(`composes Diagram Design pages into a book at ${width}px`, async ({
    page,
    request,
  }, info) => {
    const html = await source()
    await page.setViewportSize({ width, height: 900 })
    const fixture = await save(request, {
      schemaVersion: 1,
      defaultDiagramSource: "diagram-design",
      title: "Learning browser caches",
      blocks: [
        { id: "start", type: "markdown", markdown: "Read the chapter to see the original design." },
      ],
    })
    const operation = {
      type: "add-chapter",
      chapter: {
        id: "cache",
        title: "How cache works：快取",
        sections: [],
        blocks: [
          { id: "design", type: "diagram-html", title: "Diagram Design cache walkthrough", html },
        ],
      },
    }
    const summary = {
      type: "add-chapter",
      chapter: {
        id: "summary",
        title: "What to remember",
        sections: [],
        blocks: [
          {
            id: "summary-design",
            type: "diagram-html",
            title: "Cache notes",
            html: `<!doctype html><html><head><style>:root{--color-paper:#f5f5f5;--color-ink:#2d3142;--color-accent:#bf4520}body{background:var(--color-paper);padding:20px}main{max-width:340px;padding:12px}h1{color:#395b32}</style></head><body><main><h1>Cache notes</h1><svg viewBox="0 0 320 80" width="320" height="80"><text x="16" y="36">No body with 304</text></svg></main></body></html>`,
          },
        ],
      },
    }
    for (const [expectedRevision, edit] of [operation, summary].entries()) {
      const book = await request.post("http://127.0.0.1:4179/books", {
        data: { documentId: fixture.stored.documentId, expectedRevision, operation: edit },
      })
      expect(book.ok(), await book.text()).toBe(true)
    }
    const external: string[] = []
    page.on("request", (resource) => {
      if (new URL(resource.url()).origin !== new URL(fixture.url).origin)
        external.push(resource.url())
    })
    await page.goto(fixture.url)
    await page
      .getByRole("navigation", { name: "Book contents" })
      .getByRole("link", { name: "How cache works：快取" })
      .click()
    const frame = page.locator('iframe[title="Diagram Design cache walkthrough"]')
    const inner = frame.contentFrame()
    const chapter = page.getByRole("heading", { level: 1 })
    const index = page.locator(".book-contents")
    const current = index.locator('a[aria-current="page"]')
    await expect(page.locator("html")).toHaveCSS("background-color", "rgb(245, 245, 245)")
    await expect(inner.locator("body")).toHaveCSS("background-color", "rgb(245, 245, 245)")
    await expect(frame).toHaveAttribute("data-default-paper", "")
    await expect(index).toHaveCSS("border-radius", "0px")
    await expect(current).toHaveCSS("border-inline-start-color", "rgb(191, 69, 32)")
    await expect(current).toHaveCSS("color", "rgb(45, 49, 66)")
    expect((await current.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    for (const [selector, minimum] of [
      [".connection-status", 4.5],
      [".chapter-position", 4.5],
      ['a[aria-current="page"]', 4.5],
    ] as const) {
      const contrast = await page.locator(selector).evaluate((element) => {
        const rgba = (color: string) => color.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
        const luminance = (color: number[]) =>
          color.slice(0, 3).reduce((sum, channel, index) => {
            const fraction = channel / 255
            return (
              sum +
              [0.2126, 0.7152, 0.0722][index] *
                (fraction <= 0.04045 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4)
            )
          }, 0)
        const paper = rgba(getComputedStyle(document.documentElement).backgroundColor)
        const { color, backgroundColor } = getComputedStyle(element)
        const fill = rgba(backgroundColor)
        const alpha = fill[3] ?? 1
        const background = luminance(
          paper.map((channel, i) => fill[i] * alpha + channel * (1 - alpha)),
        )
        const foreground = luminance(rgba(color))
        return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
      })
      expect(contrast, selector).toBeGreaterThanOrEqual(minimum)
    }
    const previous = index.getByRole("link", { name: "Learning browser caches" })
    await previous.hover()
    await expect(previous).toHaveCSS("background-color", "rgb(236, 236, 236)")
    await page.keyboard.press("Tab")
    await previous.focus()
    await expect(previous).toHaveCSS("outline-color", "rgb(46, 90, 168)")
    await expect(previous).toHaveCSS("outline-width", "3px")
    await expect(chapter).toHaveCSS("font-weight", "400")
    await expect(chapter.locator("..")).toHaveCSS("border-block-end-color", "rgba(0, 0, 0, 0)")
    const titleInset = await inner.locator("main").evaluate((el) => el.getBoundingClientRect().left)
    expect(titleInset).toBe(0)
    await expect(inner.getByRole("heading", { level: 1 })).toHaveText("同一個檔案，不一定要再下載")
    await expect(inner.locator("svg")).toHaveCount(3)
    await expect(inner.getByText("304 NOT MODIFIED", { exact: true })).toBeVisible()
    await expect(
      page.locator(".diagram-viewport, .diagram-controls, .slide-pagination"),
    ).toHaveCount(0)
    await expect(frame).toHaveAttribute("sandbox", "allow-same-origin")
    expect(await frame.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("0px")
    await expect
      .poll(() => frame.evaluate((node) => node.getBoundingClientRect().height))
      .toBeGreaterThan(1900)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    const scroll = inner.locator(".diagram-container").first()
    await expect
      .poll(() => scroll.evaluate((el) => el.scrollWidth - el.clientWidth))
      .toBeGreaterThan(0)
    if (width === 390) {
      await scroll.focus()
      await page.keyboard.press("ArrowRight")
      await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
      await scroll.evaluate((el) => {
        el.scrollLeft = 0
      })
    }
    await expect(inner.locator("link, script")).toHaveCount(0)
    if (width === 1280) {
      await expect
        .poll(async () => (await usedFonts(page)).chapter)
        .toMatch(/Instrument Serif.*Noto Serif TC/)
      const fonts = await usedFonts(page)
      expect(fonts.index).toMatch(/Geist.*Noto Sans TC|Noto Sans TC.*Geist/)
      expect(fonts.title).toContain("Noto Serif TC")
      expect(fonts.caption).toContain("Noto Sans TC")
      expect(fonts.caption).toContain("Geist Mono")
    }
    expect(external).toEqual([])
    await page.screenshot({ path: info.outputPath("diagram-design-chapter.png"), fullPage: true })
    await page
      .getByRole("navigation", { name: "Book contents" })
      .getByRole("link", { name: "What to remember" })
      .click()
    await expect(frame).toHaveCount(0)
    const custom = page.frameLocator('iframe[title="Cache notes"]')
    await expect(custom.getByRole("heading", { name: "Cache notes" })).toHaveCSS(
      "color",
      "rgb(57, 91, 50)",
    )
    await expect(custom.locator("body")).toHaveCSS("background-color", "rgb(245, 245, 245)")
    await expect(custom.locator("body")).toHaveCSS("padding-inline-start", "20px")
    await expect(custom.locator("main")).toHaveCSS("max-width", "340px")
    await expect(custom.locator("main")).toHaveCSS("padding-inline-start", "12px")
    await expect(page.getByRole("heading", { name: "What to remember" })).toHaveCSS(
      "color",
      "rgb(45, 49, 66)",
    )
    await expect(page.locator(".diagram-viewport, .diagram-controls")).toHaveCount(0)
  })
}
