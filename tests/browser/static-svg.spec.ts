import { readFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import { validateDocument } from "../../src/document.js"
import { rendered, save, selectSlide } from "./helpers.js"

test("static SVG is a scrollable figure with no camera and revokes replaced Blob URLs", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const document = validateDocument(
    JSON.parse(
      await readFile(
        new URL("../../examples/diagram-design/http-cache-walkthrough.json", import.meta.url),
        "utf8",
      ),
    ),
  )
  const model = document.blocks[1]
  if (model.type !== "diagram-deck") throw new Error("Expected cache deck")
  await page.addInitScript(() => {
    const revoked: string[] = []
    Object.defineProperty(window, "svgTestRevoked", { value: revoked })
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url) => {
      revoked.push(url)
      revoke(url)
    }
  })
  await page.goto((await save(request, document)).url)
  const deck = page.locator('[data-block-id="http-cache"]')
  const image = deck.getByRole("img", { name: model.slides[0].title, exact: true })
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await expect(image).toHaveAttribute("src", /^blob:/)
  const blob = await image.getAttribute("src")
  await expect(deck.getByRole("group", { name: "Diagram controls" })).toHaveCount(0)
  await expect(deck.locator(".diagram-viewport")).toHaveCount(0)
  await expect(deck.locator(".slide-explanation")).toContainText("max-age=60")
  const scroller = deck.locator(".static-diagram")
  await scroller.focus()
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  await expect(deck).toHaveAttribute("data-slide-id", "fresh")
  expect(await page.evaluate(() => window.document.documentElement.scrollWidth)).toBe(390)
  const next = model.slides[1]
  await selectSlide(deck, next.id)
  await rendered(deck)
  await expect(deck.getByRole("img", { name: next.title, exact: true })).toBeVisible()
  await expect(deck.getByRole("group", { name: "Diagram controls" })).toHaveCount(0)
  await expect
    .poll(() => page.evaluate((url) => Reflect.get(window, "svgTestRevoked").includes(url), blob))
    .toBe(true)
})
