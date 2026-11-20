import { expect, test } from "@playwright/test"
import { save } from "./helpers.js"

test("standalone code preserves raw text and scrolls without widening the article", async ({
  page,
  request,
}) => {
  const code = `\n\t<strong>${"long & literal ".repeat(20)}</strong>\n\n\`\`\`\n`
  const fixture = await save(request, {
    schemaVersion: 1,
    title: "Code blocks",
    blocks: [
      { id: "intro", type: "markdown", markdown: "[Read more](https://example.com)" },
      { id: "markup", type: "code", code, language: "HTML" },
      { id: "plain", type: "code", code: "  plain text\n" },
      { id: "fenced", type: "markdown", markdown: "```sh\necho hello\n```" },
    ],
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(fixture.url)

  const block = page.getByRole("region", { name: "HTML code" })
  await expect(page.locator("[data-block-id=markup] figcaption")).toHaveText("HTML")
  await expect(block.locator("code")).toHaveJSProperty("textContent", code)
  await expect(block.locator("strong")).toHaveCount(0)
  await expect(
    page.getByRole("region", { name: "Code block", exact: true }).locator("code"),
  ).toHaveJSProperty("textContent", "  plain text\n")
  await expect(page.locator("[data-block-id=fenced] pre code")).toHaveText("echo hello")

  expect(await block.evaluate((element) => element.scrollWidth)).toBeGreaterThan(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole("link", { name: "Read more" }).focus()
  await page.keyboard.press("Tab")
  await expect(block).toBeFocused()
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => block.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
})
