import { readFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import { validateDocument } from "../../src/document.js"
import { rendered, save, selectSlide } from "./helpers.js"

async function cacheDocument() {
  return validateDocument(
    JSON.parse(
      await readFile(
        new URL("../../examples/diagram-design/http-cache-walkthrough.json", import.meta.url),
        "utf8",
      ),
    ),
  )
}

function recordRevokedUrls() {
  const revoked: string[] = []
  Object.defineProperty(window, "svgTestRevoked", { value: revoked })
  const revoke = URL.revokeObjectURL.bind(URL)
  URL.revokeObjectURL = (url) => {
    revoked.push(url)
    revoke(url)
  }
}

for (const width of [390, 1280]) {
  test(`static SVG and Mermaid share controls and keep requests local at ${width}px`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(recordRevokedUrls)
    const document = await cacheDocument()
    const model = document.blocks[1]
    if (model.type !== "diagram-deck") throw new Error("Expected cache deck")
    model.slides.push({
      id: "mermaid",
      title: "Mermaid control",
      explanationMarkdown: "Other source, same deck.",
      mermaid: "flowchart LR\n A[Original] --> B[Next]",
    })
    const { url } = await save(request, document)
    const external: string[] = []
    page.on("request", (request) => {
      const target = new URL(request.url())
      if (target.origin !== new URL(url).origin) external.push(target.hostname)
    })
    await page.goto(url)
    const deck = page.locator('[data-block-id="http-cache"]')
    const viewport = deck.getByRole("region", { name: "Interactive diagram" })
    const toolbar = deck.getByRole("group", { name: "Diagram controls" })
    const control = (name: string) => toolbar.getByRole("button", { name, exact: true })
    const image = deck.locator(".diagram-svg > svg > image")
    const zoom = deck.getByRole("status", { name: "Current zoom" })
    let previous: string | null = null
    for (const slide of model.slides.slice(0, 3)) {
      await selectSlide(deck, slide.id)
      await rendered(deck)
      await expect(deck.getByRole("img", { name: slide.title, exact: true })).toBeVisible()
      await expect(image).toHaveAttribute("href", /^blob:/)
      await expect(deck.locator(".diagram-svg svg text, .diagram-svg svg style")).toHaveCount(0)
      if (previous)
        await expect
          .poll(() =>
            page.evaluate((url) => Reflect.get(window, "svgTestRevoked").includes(url), previous),
          )
          .toBe(true)
      previous = await image.getAttribute("href")
      await viewport.screenshot({ path: info.outputPath(`${slide.id}.png`) })
      await control("Zoom in").click()
      const fitted = (await zoom.textContent())?.trim() ?? ""
      await control("Reset zoom").click()
      await expect(zoom).toHaveText("100%")
      await control("Fit to screen").click()
      await expect(zoom).not.toHaveText(fitted)
      await control("Reset zoom").click()
      await control("Zoom in").click()
      const stage = deck.locator(".diagram-svg")
      const before = await stage.evaluate((element) => getComputedStyle(element).transform)
      const bounds = await viewport.boundingBox()
      if (!bounds) throw new Error("Missing viewport")
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width / 2 + 28, bounds.y + bounds.height / 2, {
        steps: 3,
      })
      await page.mouse.up()
      await expect
        .poll(() => stage.evaluate((element) => getComputedStyle(element).transform))
        .not.toBe(before)
    }
    await control("Fullscreen").click()
    await expect(control("Exit fullscreen")).toBeVisible()
    await control("Exit fullscreen").click()
    await expect(image).toHaveAttribute("href", previous ?? "")
    await control("Show source").click()
    await expect(deck.locator("pre code")).toContainText("<svg")
    await control("Show diagram").click()
    await selectSlide(deck, "mermaid")
    await rendered(deck)
    await expect(
      deck.locator(".diagram-svg svg text").filter({ hasText: "Original" }),
    ).toBeVisible()
    await expect(image).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate((url) => Reflect.get(window, "svgTestRevoked").includes(url), previous),
      )
      .toBe(true)
    expect(external).toEqual([])
  })
}

test("a static image decoding failure stays within its slide and releases the URL", async ({
  page,
  request,
}) => {
  await page.addInitScript(recordRevokedUrls)
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode
    HTMLImageElement.prototype.decode = function () {
      if (this.src.startsWith("blob:"))
        return Promise.reject(new Error("Test image could not decode"))
      return decode.call(this)
    }
  })
  const { url } = await save(request, await cacheDocument())
  await page.goto(url)
  const deck = page.locator('[data-block-id="http-cache"]')
  await expect(deck.getByRole("alert")).toContainText("Test image could not decode")
  await expect
    .poll(() =>
      page.evaluate(() =>
        Reflect.get(window, "svgTestRevoked").some((url: string) => url.startsWith("blob:")),
      ),
    )
    .toBe(true)
  await expect(deck.getByRole("button", { name: "Zoom in" })).toBeDisabled()
  await expect(deck.locator("pre code")).toContainText("<svg")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("同一個檔案，不一定要再下載")
})

test("leaving the original chapter releases an SVG image", async ({ page, request }) => {
  await page.addInitScript(recordRevokedUrls)
  const fixture = await save(request, await cacheDocument())
  const response = await request.post("http://127.0.0.1:4179/books", {
    data: {
      documentId: fixture.stored.documentId,
      expectedRevision: 0,
      operation: {
        type: "add-chapter",
        chapter: { id: "later", title: "Later chapter", blocks: [], sections: [] },
      },
    },
  })
  expect(response.ok(), await response.text()).toBe(true)
  await page.goto(fixture.url)
  const image = page.locator(".diagram-svg svg image")
  await expect(image).toHaveAttribute("href", /^blob:/)
  const url = await image.getAttribute("href")
  await page
    .getByRole("navigation", { name: "Book contents" })
    .getByRole("link", { name: "Later chapter" })
    .click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Later chapter")
  await expect(image).toHaveCount(0)
  await expect
    .poll(() => page.evaluate((old) => Reflect.get(window, "svgTestRevoked").includes(old), url))
    .toBe(true)
})
