import { readFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import { save } from "./helpers.js"

const source = () =>
  readFile(new URL("../../examples/diagram-design/http-cache.html", import.meta.url), "utf8")

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
        title: "How cache works",
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
            html: `<!doctype html><html><head><style>h1{color:#bf4520}</style></head><body><h1>Cache notes</h1><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 80" width="320" height="80"><text x="16" y="36">No body with 304</text></svg></body></html>`,
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
      .getByRole("link", { name: "How cache works" })
      .click()
    const frame = page.locator('iframe[title="Diagram Design cache walkthrough"]')
    const inner = frame.contentFrame()
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
    expect(external).toEqual([])
    await page.screenshot({ path: info.outputPath("diagram-design-chapter.png"), fullPage: true })
    await page
      .getByRole("navigation", { name: "Book contents" })
      .getByRole("link", { name: "What to remember" })
      .click()
    await expect(frame).toHaveCount(0)
    const summaryHeading = page
      .frameLocator('iframe[title="Cache notes"]')
      .getByRole("heading", { name: "Cache notes" })
    await expect(summaryHeading).toHaveCSS("color", "rgb(191, 69, 32)")
    await expect(page.getByRole("heading", { name: "What to remember" })).not.toHaveCSS(
      "color",
      "rgb(191, 69, 32)",
    )
    await expect(page.locator(".diagram-viewport, .diagram-controls")).toHaveCount(0)
  })
}
