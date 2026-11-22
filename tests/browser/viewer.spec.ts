import { expect, test } from "@playwright/test"
import { paginationFixture } from "../fixtures/reading-layout.js"
import { documentFixture, getDeck, rendered, save, selectSlide } from "./helpers.js"

test("bundled Markdown, math, code, and static SVG coexist", async ({ page, request }) => {
  const fixture = await save(request, documentFixture())
  const requests: string[] = []
  const referrers: string[] = []
  page.on("request", (request) => {
    requests.push(request.url())
    const referrer = request.headers().referer
    if (referrer) referrers.push(referrer)
  })
  await page.goto(fixture.url)
  await expect(page.getByRole("heading", { name: "Browser fixture", exact: true })).toBeVisible()
  await expect(page).toHaveTitle("Browser fixture — Sketchbook")
  await expect(page.locator(".brand")).toHaveText("Sketchbook")
  await expect(page.locator(".katex-display")).toHaveCount(1)
  await expect(page.locator(".katex").first()).toBeVisible()
  await expect(page.locator("pre code").first()).toHaveText("const safe = true;\n")
  await expect(page.getByRole("table")).toBeVisible()
  await expect(page.getByRole("link", { name: "Safe link" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  )
  const first = page.locator('[data-block-id="first"]')
  const second = page.locator('[data-block-id="second"]')
  await rendered(first)
  await rendered(second)
  await expect(first.getByRole("img", { name: "Overview" })).toHaveAttribute("src", /^blob:/)
  expect(requests.every((url) => new URL(url).origin === new URL(fixture.url).origin)).toBeTruthy()
  const token = new URLSearchParams(new URL(fixture.url).hash.slice(1)).get("token")
  expect(token).toBeTruthy()
  expect(requests.every((url) => !url.includes(token ?? ""))).toBeTruthy()
  expect(referrers).toEqual([])
  await page.reload()
  await rendered(first)
  await expect(page.locator(".connection-status")).toHaveText("Connected")
})

test("decks switch independently with focused keyboard controls and preserve scroll", async ({
  page,
  request,
}) => {
  await page.goto((await save(request, documentFixture())).url)
  const first = page.locator('[data-block-id="first"]')
  const second = page.locator('[data-block-id="second"]')
  await rendered(first)
  await rendered(second)
  await page.keyboard.press("ArrowRight")
  await expect(first).toHaveAttribute("data-slide-id", "overview")
  await expect(second).toHaveAttribute("data-slide-id", "overview")
  await first.focus()
  const scroll = await page.evaluate(() => scrollY)
  await page.keyboard.press("ArrowRight")
  await rendered(first)
  await expect(first).toHaveAttribute("data-slide-id", "detail")
  await expect(first).toContainText("Explanation first detail.")
  await expect(second).toHaveAttribute("data-slide-id", "overview")
  expect(Math.abs((await page.evaluate(() => scrollY)) - scroll)).toBeLessThan(10)
  await selectSlide(first, "end")
  await rendered(first)
  await expect(first.getByRole("button", { name: "Next slide" })).toBeDisabled()
  await second.focus()
  await page.keyboard.press("ArrowRight")
  await expect(second).toHaveAttribute("data-slide-id", "detail")
  await expect(first).toHaveAttribute("data-slide-id", "end")
  await second.getByRole("button", { name: "Next slide", exact: true }).focus()
  await page.keyboard.press("ArrowLeft")
  await expect(second).toHaveAttribute("data-slide-id", "overview")
  await expect(first).toHaveAttribute("data-slide-id", "end")
})

for (const width of [390, 1280]) {
  test(`visible footer arrows and dots navigate independently at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 960 })
    await page.goto((await save(request, documentFixture())).url)
    const first = page.locator('[data-block-id="first"]')
    const second = page.locator('[data-block-id="second"]')
    await rendered(first)
    const previous = first.getByRole("button", { name: "Previous slide" })
    const next = first.getByRole("button", { name: "Next slide" })
    const viewport = first.locator(".deck-viewport")
    const dots = first.locator(".slide-pagination")
    await expect(previous).toBeDisabled()
    await expect(next).toBeEnabled()
    await expect(previous).toHaveText("Previous")
    await expect(next).toHaveText("Next")
    await expect(first.locator(".slide-count")).toHaveText("1 / 3")
    await expect(first.locator(".deck-arrow-icon")).toHaveCount(2)
    await expect(dots.locator(".slide-dot")).toHaveCount(3)
    await expect(first.getByRole("combobox")).toHaveCount(0)
    await expect(first.getByRole("heading", { name: "Overview", exact: true })).toHaveCount(1)
    await expect(dots.getByRole("button", { name: "Slide 1: Overview" })).toHaveAttribute(
      "aria-current",
      "step",
    )
    await expect(next).toHaveAttribute("aria-controls", (await viewport.getAttribute("id")) ?? "")
    const previousBox = await previous.boundingBox()
    const nextBox = await next.boundingBox()
    const viewportBox = await viewport.boundingBox()
    if (!previousBox || !nextBox || !viewportBox) throw new Error("Missing carousel layout")
    expect(previousBox.width).toBeGreaterThanOrEqual(44)
    expect(previousBox.height).toBeGreaterThanOrEqual(44)
    expect(nextBox.width).toBeGreaterThanOrEqual(44)
    expect(nextBox.height).toBeGreaterThanOrEqual(44)
    expect(previousBox.y).toBeGreaterThanOrEqual(viewportBox.y + viewportBox.height)
    expect(nextBox.y).toBeGreaterThanOrEqual(viewportBox.y + viewportBox.height)
    expect(previousBox.x).toBeLessThan(nextBox.x)
    await next.click()
    await rendered(first)
    await expect(first).toHaveAttribute("data-slide-id", "detail")
    await expect(first.locator(".slide-count")).toHaveText("2 / 3")
    await expect(previous).toBeEnabled()
    await expect(dots.getByRole("button", { name: "Slide 2: Detail" })).toHaveAttribute(
      "aria-current",
      "step",
    )
    await expect(second).toHaveAttribute("data-slide-id", "overview")
    await dots.getByRole("button", { name: "Slide 3: End" }).click()
    await rendered(first)
    await expect(first).toHaveAttribute("data-slide-id", "end")
    await expect(next).toBeDisabled()
    await expect(dots.locator('[aria-current="step"]')).toHaveCount(1)
    await previous.click()
    await expect(first).toHaveAttribute("data-slide-id", "detail")
    await dots.getByRole("button", { name: "Slide 1: Overview" }).click()
    await expect(previous).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

for (const width of [390, 1440]) {
  test(`20-slide pagination keeps visible navigation and all positions contained at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    const content = paginationFixture()
    await page.goto((await save(request, content)).url)
    const deck = page.locator('[data-block-id="reading"]')
    await rendered(deck)
    const pagination = deck.locator(".slide-pagination")
    const previous = pagination.getByRole("button", { name: "Previous slide" })
    const next = pagination.getByRole("button", { name: "Next slide" })
    await expect(pagination.locator(".slide-dot")).toHaveCount(20)
    await expect(previous).toHaveText("Previous")
    await expect(next).toHaveText("Next")
    await expect(previous).toBeDisabled()
    await expect(pagination.locator(".slide-count")).toHaveText("1 / 20")
    await next.click()
    await rendered(deck)
    await expect(deck).toHaveAttribute("data-slide-id", "part-2")
    await expect(pagination.locator(".slide-count")).toHaveText("2 / 20")
    const last = pagination.getByRole("button", {
      name: "Slide 20: Part 20: a complete, untruncated teaching title",
      exact: true,
    })
    await last.focus()
    await page.keyboard.press("Enter")
    await rendered(deck)
    await expect(deck).toHaveAttribute("data-slide-id", "part-20")
    await expect(last).toHaveAttribute("aria-current", "step")
    await expect(pagination.locator('[aria-current="step"]')).toHaveCount(1)
    await expect(pagination.locator(".slide-count")).toHaveText("20 / 20")
    await expect(next).toBeDisabled()
    await expect(previous).toBeEnabled()
    await expect(deck.locator(".deck-heading h3")).toHaveText(
      "Part 20: a complete, untruncated teaching title",
    )
    const bounds = await deck.boundingBox()
    if (!bounds) throw new Error("Missing pagination card")
    for (const button of [previous, next]) {
      const box = await button.boundingBox()
      if (!box) throw new Error("Missing navigation button")
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    const positions = await pagination.locator("button, .slide-count").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect()
        return { left: box.left, right: box.right }
      }),
    )
    for (const position of positions) {
      expect(position.left).toBeGreaterThanOrEqual(bounds.x)
      expect(position.right).toBeLessThanOrEqual(bounds.x + bounds.width)
    }
    await previous.click()
    await expect(deck).toHaveAttribute("data-slide-id", "part-19")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

for (const width of [600, 601]) {
  test(`heading badge uses no narrow title space at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 960 })
    await page.goto((await save(request, documentFixture())).url)
    const deck = page.locator('[data-block-id="first"]')
    await rendered(deck)
    const badge = deck.locator(".deck-kind")
    if (width <= 600) {
      await expect(badge).toBeHidden()
      expect(await badge.boundingBox()).toBeNull()
    } else await expect(badge).toBeVisible()
  })
}

for (const width of [390, 1280]) {
  test(`article headings stay stable across slide switches and legacy Markdown at ${width}px`, async ({
    page,
    request,
  }) => {
    const document = documentFixture()
    const intro = document.blocks.find((block) => block.id === "intro")
    const legacy = document.blocks.find((block) => block.id === "between")
    const tail = document.blocks.find((block) => block.id === "tail")
    if (intro?.type !== "markdown" || legacy?.type !== "markdown" || tail?.type !== "markdown")
      throw new Error("Missing article blocks")
    intro.markdown = "## Article guide\n\n### Guide detail"
    legacy.markdown =
      "# Legacy **chapter**\n\n## Legacy detail\n\n###### Deep detail\n\n```md\n# Literal source\n```"
    tail.markdown = "## Conclusion"
    const deck = getDeck(document, "first")
    deck.title = "Overview"
    deck.slides[0].explanationMarkdown =
      "# Explanation topic\n\n## Explanation detail\n\n###### Explanation depth\n\nNormal **body text**."
    deck.slides[1].explanationMarkdown = "### Detail topic\n\n#### Detail explanation"
    await page.setViewportSize({ width, height: 960 })
    const fixture = await save(request, document)
    const loaded = page.waitForResponse(
      (response) => response.url().includes("/api/documents/") && response.status() === 200,
    )
    await page.goto(fixture.url)
    expect((await (await loaded).json()).document).toEqual(document)
    const first = page.locator('[data-block-id="first"]')
    await rendered(first)
    await expect(page.locator("main h1")).toHaveText([document.title])
    const chapters = ["Article guide", "Overview", "Legacy chapter", "Deck second", "Conclusion"]
    await expect(page.locator("main h2")).toHaveText(chapters)
    await expect(page.locator('[data-block-id="between"] h3')).toHaveText("Legacy detail")
    await expect(page.locator('[data-block-id="between"] h6')).toHaveText("Deep detail")
    await expect(page.locator('[data-block-id="between"] pre code')).toHaveText(
      "# Literal source\n",
    )
    await expect(first).toHaveAccessibleName("Overview")
    await expect(first.locator(".deck-heading h2")).toHaveText("Overview")
    await expect(first.locator(".deck-heading h3")).toHaveText("Overview")
    await expect(first.locator(".deck-heading h3")).toHaveClass("visually-hidden")
    const hiddenSlide = await first.locator(".deck-heading h3").boundingBox()
    expect(hiddenSlide?.width).toBe(1)
    expect(hiddenSlide?.height).toBe(1)
    await expect(
      first.locator(".slide-explanation h1, .slide-explanation h2, .slide-explanation h3"),
    ).toHaveCount(0)
    await expect(first.locator(".slide-explanation h4")).toHaveText("Explanation topic")
    await expect(first.locator(".slide-explanation h5")).toHaveText("Explanation detail")
    await expect(first.locator(".slide-explanation h6")).toHaveText("Explanation depth")
    await selectSlide(first, "detail")
    await rendered(first)
    await expect(page.locator("main h1")).toHaveText([document.title])
    await expect(page.locator("main h2")).toHaveText(chapters)
    await expect(first).toHaveAccessibleName("Overview")
    await expect(first.locator(".deck-heading h3")).toHaveText("Detail")
    await expect(first.locator(".deck-heading h3")).not.toHaveClass("visually-hidden")
    await expect(first.locator(".slide-explanation h4")).toHaveText("Detail topic")
    await expect(first.locator(".slide-explanation h5")).toHaveText("Detail explanation")
    await selectSlide(first, "overview")
    await expect(page.locator("main h2")).toHaveText(chapters)
    await expect(first.locator(".deck-heading h3")).toHaveClass("visually-hidden")
  })
}

test("mobile definitions keep technical names intact and explanations use body text", async ({
  page,
  request,
}) => {
  const document = documentFixture()
  const intro = document.blocks.find((block) => block.id === "intro")
  const tail = document.blocks.find((block) => block.id === "tail")
  if (intro?.type !== "markdown" || tail?.type !== "markdown")
    throw new Error("Missing text blocks")
  intro.markdown =
    "## AgentSession and RuntimeHost\n\nArticle body text.\n\n| Term | Definition |\n| --- | --- |\n| **AgentSession** | One active conversation and its current state. |\n| **RuntimeHost** | Owns the runtime state and available services. |"
  const long = "LongTechnicalIdentifier".repeat(20)
  tail.markdown = `## ${long}\n\n${long}\n\n| Term | Definition |\n| --- | --- |\n| ${long} | Contained table text. |`
  getDeck(document, "first").slides[0].explanationMarkdown = "AgentSession is **normal body text**."
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto((await save(request, document)).url)
  const first = page.locator('[data-block-id="first"]')
  await rendered(first)
  const type = (node: Element) => {
    const style = getComputedStyle(node)
    return { size: style.fontSize, color: style.color, lineHeight: style.lineHeight }
  }
  const bodyType = await page.locator('[data-block-id="intro"] p').evaluate(type)
  expect(await first.locator(".slide-explanation p").evaluate(type)).toEqual(bodyType)
  expect(Number.parseFloat(bodyType.size)).toBeGreaterThanOrEqual(16)
  const names = await page.locator('[data-block-id="intro"] td strong').evaluateAll((nodes) =>
    nodes.map((node) => {
      const range = window.document.createRange()
      range.selectNodeContents(node)
      return range.getClientRects().length
    }),
  )
  expect(names).toEqual([1, 1])
  const headingLines = await page.locator('[data-block-id="intro"] h2').evaluate((node) => {
    const range = window.document.createRange()
    range.setStart(node.firstChild as Text, 0)
    range.setEnd(node.firstChild as Text, "AgentSession".length)
    return range.getClientRects().length
  })
  expect(headingLines).toBe(1)
  expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  )
})

test("conditional polling keeps stable selection and chooses the nearest old slide after deletion", async ({
  page,
  request,
}) => {
  const document = documentFixture()
  let fixture = await save(request, document)
  const responses: number[] = []
  const conditional: string[] = []
  page.on("response", (response) => {
    if (response.url().includes("/api/documents/")) responses.push(response.status())
  })
  page.on("request", (request) => {
    const etag = request.headers()["if-none-match"]
    if (etag) conditional.push(etag)
  })
  await page.goto(fixture.url)
  const first = page.locator('[data-block-id="first"]')
  await rendered(first)
  await selectSlide(first, "detail")
  const deck = getDeck(document, "first")
  deck.slides[1].explanationMarkdown = "Updated detail explanation."
  deck.slides = [deck.slides[2], deck.slides[0], deck.slides[1]]
  fixture = await save(request, document, fixture.stored)
  await expect(first).toContainText("Updated detail explanation.")
  await expect(first).toHaveAttribute("data-slide-id", "detail")
  await expect.poll(() => responses.includes(304)).toBeTruthy()
  expect(conditional.length).toBeGreaterThan(0)
  deck.slides = deck.slides.filter((slide) => slide.id !== "detail")
  await save(request, document, fixture.stored)
  await expect(first).toHaveAttribute("data-slide-id", "overview")
  await expect(page.locator('[data-block-id="second"]')).toHaveAttribute(
    "data-slide-id",
    "overview",
  )
})

test("hidden polling pauses, resumes, and disconnection preserves last content", async ({
  page,
  request,
}) => {
  await page.goto((await save(request, documentFixture())).url)
  await rendered(page.locator('[data-block-id="first"]'))
  let requests = 0
  page.on("request", (request) => {
    if (request.url().includes("/api/documents/")) requests++
  })
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  const count = requests
  await page.waitForTimeout(2200)
  expect(requests).toBe(count)
  await page.route("**/api/documents/**", (route) => route.abort("connectionrefused"))
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await expect(page.locator(".connection-status")).toContainText("Connection lost")
  await expect(page.getByRole("heading", { name: "Browser fixture", exact: true })).toBeVisible()
  await rendered(page.locator('[data-block-id="first"]'))
  await page.unroute("**/api/documents/**")
  await expect(page.locator(".connection-status")).toHaveText("Connected")
})
