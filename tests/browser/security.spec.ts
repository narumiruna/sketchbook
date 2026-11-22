import { expect, test } from "@playwright/test"
import { RetiredMermaidError } from "../../src/retired-format.js"
import { documentFixture, rendered, save } from "./helpers.js"

test("Markdown and KaTeX cannot run HTML, load images, or create unsafe links", async ({
  page,
  request,
}) => {
  const document = documentFixture()
  document.blocks.unshift({
    id: "untrusted-text",
    type: "markdown",
    markdown: [
      "<script>window.sketchbookCompromised = true</script>",
      '<img src="https://external.invalid/raw.png" onerror="window.sketchbookCompromised = true">',
      '<iframe src="https://external.invalid/frame"></iframe>',
      "![External image](https://external.invalid/image.png)",
      "![Local image](/api/documents/not-an-image)",
      "[Unsafe](javascript:alert%281%29)",
      "[Data](data:text/html,unsafe)",
      "$\\href{javascript:alert(1)}{unsafe}$",
      "$\\includegraphics{https://external.invalid/math.png}$",
      "$\\htmlClass{unsafe}{x}$",
      "$\\rule{1000em}{1em}$",
    ].join("\n\n"),
  })
  const fixture = await save(request, document)
  const external: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== new URL(fixture.url).origin) external.push(request.url())
  })
  await page.goto(fixture.url)
  await rendered(page.locator('[data-block-id="first"]'))
  const block = page.locator('[data-block-id="untrusted-text"]')
  await expect(block.locator("script, img, iframe, object, embed, .unsafe")).toHaveCount(0)
  await expect(block.locator('a[href^="javascript:"], a[href^="data:"]')).toHaveCount(0)
  expect(await page.evaluate(() => "sketchbookCompromised" in window)).toBeFalsy()
  expect(external).toEqual([])
  const rules = await block
    .locator(".katex .katex-rule")
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width))
  expect(rules.length).toBeGreaterThan(0)
  expect(Math.max(...rules)).toBeLessThanOrEqual(500)
  await expect(page.getByText("Last text stays readable.")).toBeVisible()
})

test("an invalid formula stays local without hiding other content", async ({ page, request }) => {
  const document = documentFixture()
  document.blocks.unshift({ id: "bad-math", type: "markdown", markdown: "$\\notACommand{x}$" })
  await page.goto((await save(request, document)).url)
  await expect(page.locator('[data-block-id="bad-math"]')).toContainText("notACommand")
  await rendered(page.locator('[data-block-id="first"]'))
  await expect(page.getByText("Last text stays readable.")).toBeVisible()
})

for (const location of ["The original page", "A book chapter or section"] as const) {
  test(`the Viewer explains a retired diagram in: ${location}`, async ({ page, request }) => {
    const fixture = await save(request, documentFixture())
    const error = new RetiredMermaidError(location).message
    await page.route("**/api/documents/**", (route) => route.fulfill({ status: 422, body: error }))
    await page.goto(fixture.url)
    await expect(page.getByRole("status")).toHaveText(error)
    await expect(page.getByRole("navigation")).toHaveCount(0)
    await page.unroute("**/api/documents/**")
    await expect(page.getByRole("heading", { name: "Browser fixture", exact: true })).toBeVisible()
    await page.route("**/api/documents/**", (route) => route.fulfill({ status: 422, body: error }))
    await expect(page.getByRole("status")).toHaveText(`${error} Last loaded content is kept.`)
    await expect(page.getByRole("heading", { name: "Browser fixture", exact: true })).toBeVisible()
  })
}
