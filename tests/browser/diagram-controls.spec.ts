import { expect, type Locator, type Page, test } from "@playwright/test"
import {
  documentFixture,
  getDeck,
  openDiagramControls,
  rendered,
  save,
  selectSlide,
} from "./helpers.js"

function wideSource() {
  return `flowchart LR\n${Array.from(
    { length: 14 },
    (_, index) =>
      `N${index}["Node ${index} with a deliberately wide native label"] --> N${index + 1}`,
  ).join("\n")}`
}

const zoom = (deck: Locator) => deck.getByRole("status", { name: "Current zoom" })
const control = (deck: Locator, name: string) => deck.getByRole("button", { name, exact: true })

async function percentage(deck: Locator) {
  return Number.parseInt(
    (await deck.locator('output[aria-label="Current zoom"]').textContent()) ?? "",
    10,
  )
}

async function expectGraphInsideViewport(deck: Locator) {
  const viewport = await deck.locator(".diagram-viewport").boundingBox()
  const graphic = await deck.locator(".diagram-svg > svg").boundingBox()
  if (!viewport || !graphic) throw new Error("Missing diagram geometry")
  expect(graphic.x).toBeGreaterThanOrEqual(viewport.x)
  expect(graphic.y).toBeGreaterThanOrEqual(viewport.y)
  expect(graphic.x + graphic.width).toBeLessThanOrEqual(viewport.x + viewport.width + 1)
  expect(graphic.y + graphic.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1)
}

async function rejectFullscreen(page: Page) {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("Denied for test"))
  })
}

for (const width of [390, 1280]) {
  test(`disclosure starts collapsed, skips hidden controls, and supports Enter and Space at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 960 })
    const content = documentFixture()
    getDeck(content, "first").slides[0].mermaid = "flowchart LR\n A[Input] --> B[Output]"
    await page.goto((await save(request, content)).url)
    const deck = page.locator('[data-block-id="first"]')
    await rendered(deck)
    const primary = deck.locator(".diagram-controls")
    const secondary = deck.locator("fieldset.diagram-secondary-controls")
    const disclosure = control(deck, "More controls")
    const viewport = deck.locator(".diagram-viewport")
    await expect(primary.getByRole("button")).toHaveCount(3)
    for (const name of ["Fit to screen", "Fullscreen", "More controls"])
      await expect(primary.getByRole("button", { name, exact: true })).toBeVisible()
    await expect(secondary).toHaveCount(1)
    await expect(secondary).toBeHidden()
    await expect(disclosure).toHaveAttribute("aria-expanded", "false")
    const target = await disclosure.getAttribute("aria-controls")
    expect(target).toBeTruthy()
    await expect(secondary).toHaveAttribute("id", target ?? "")
    await expect(page.locator(`[id="${target}"]`)).toHaveCount(1)
    const otherDisclosure = page
      .locator('[data-block-id="second"]')
      .getByRole("button", { name: "More controls" })
    expect(await otherDisclosure.getAttribute("aria-controls")).not.toBe(target)
    for (const name of ["Zoom out", "Zoom in", "Reset zoom", "Show source"])
      await expect(control(deck, name)).toHaveCount(0)
    await expect(secondary.locator('output[aria-label="Current zoom"]')).toBeHidden()
    const buttons = await primary.locator("button").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect()
        return { y: box.y, width: box.width, height: box.height }
      }),
    )
    expect(
      Math.max(...buttons.map((box) => box.y)) - Math.min(...buttons.map((box) => box.y)),
    ).toBeLessThanOrEqual(1)
    for (const box of buttons) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await disclosure.focus()
    await page.keyboard.press("Tab")
    await expect(viewport).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(disclosure).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(disclosure).toHaveAttribute("aria-expanded", "true")
    await expect(disclosure).toBeFocused()
    await expect(secondary).toBeVisible()
    for (const name of ["Zoom out", "Zoom in", "Reset zoom", "Show source"])
      await expect(secondary.getByRole("button", { name, exact: true })).toBeVisible()
    await expect(secondary.getByRole("status", { name: "Current zoom" })).toBeVisible()
    const help = secondary.locator(".diagram-pan-hint")
    await expect(help).toBeVisible()
    await expect(help).toContainText(/mouse or pen.*pan.*Ctrl or Command.*wheel/i)
    await expect(viewport).toHaveAccessibleName("Interactive diagram")
    await expect(viewport).toHaveAccessibleDescription(/mouse or pen.*pan.*Ctrl or Command.*wheel/i)
    await page.keyboard.press("Tab")
    await expect(control(deck, "Zoom out")).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Space")
    await expect(disclosure).toHaveAttribute("aria-expanded", "false")
    await expect(secondary).toBeHidden()
    await page.keyboard.press("Tab")
    await expect(viewport).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Space")
    await expect(secondary).toBeVisible()
  })
}

test("source changes reset the disclosure and source view without carrying the old camera", async ({
  page,
  request,
}) => {
  await page.goto((await save(request, documentFixture())).url)
  const deck = page.locator('[data-block-id="first"]')
  await rendered(deck)
  await openDiagramControls(deck)
  await control(deck, "Reset zoom").click()
  await control(deck, "Zoom in").click()
  await control(deck, "Show source").click()
  await expect(control(deck, "Show diagram")).toHaveAttribute("aria-pressed", "true")
  await expect(control(deck, "More controls")).toHaveAttribute("aria-expanded", "true")
  await selectSlide(deck, "detail")
  await rendered(deck)
  await expect(control(deck, "More controls")).toHaveAttribute("aria-expanded", "false")
  await expect(deck.locator(".diagram-secondary-controls")).toBeHidden()
  await expect(deck.locator(".diagram-source")).toHaveCount(0)
  await openDiagramControls(deck)
  await expect(control(deck, "Show source")).toHaveAttribute("aria-pressed", "false")
  await expect(zoom(deck)).not.toHaveText("125%")
})

test("a live source replacement restores hidden-control focus but does not steal outside focus", async ({
  page,
  request,
}) => {
  const content = documentFixture()
  const fixture = await save(request, content)
  await page.goto(fixture.url)
  const deck = page.locator('[data-block-id="first"]')
  await rendered(deck)
  await openDiagramControls(deck)
  await control(deck, "Reset zoom").focus()
  getDeck(content, "first").slides[0].mermaid = "flowchart LR\n New[Updated input] --> Saved"
  const updated = await save(request, content, fixture.stored)
  // SVG line wrapping can split words into tspans without separator whitespace.
  await expect(
    deck.locator(".diagram-svg > svg .rough-node").filter({ hasText: /Updated\s*input/ }),
  ).toHaveCount(1)
  await rendered(deck)
  await expect(control(deck, "More controls")).toHaveAttribute("aria-expanded", "false")
  await expect(deck.locator(".diagram-secondary-controls")).toBeHidden()
  await expect(control(deck, "More controls")).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(deck.locator(".diagram-viewport")).toBeFocused()
  await openDiagramControls(deck)
  const other = page.locator('[data-block-id="second"]')
  await other.focus()
  getDeck(content, "first").slides[0].mermaid = "flowchart LR\n New[Second update] --> Saved"
  await save(request, content, updated.stored)
  await expect(
    deck.locator(".diagram-svg > svg .rough-node").filter({ hasText: /Second\s*update/ }),
  ).toHaveCount(1)
  await expect(control(deck, "More controls")).toHaveAttribute("aria-expanded", "false")
  await expect(other).toBeFocused()
})

test("fit shows the whole graph; Reset restores native labels and zoom respects bounds", async ({
  page,
  request,
}) => {
  const content = documentFixture()
  getDeck(content, "first").slides[0].mermaid = wideSource()
  await page.goto((await save(request, content)).url)
  const deck = page.locator('[data-block-id="first"]')
  await rendered(deck)
  await openDiagramControls(deck)
  const fitted = await percentage(deck)
  expect(fitted).toBeLessThan(100)
  expect(fitted).toBeGreaterThan(0)
  await expectGraphInsideViewport(deck)
  await control(deck, "Reset zoom").click()
  await expect(zoom(deck)).toHaveText("100%")
  const nativeTextSize = await deck
    .locator(".diagram-svg svg text")
    .first()
    .evaluate((text) => {
      const matrix = (text as SVGGraphicsElement).getScreenCTM()
      return Number.parseFloat(getComputedStyle(text).fontSize) * Math.abs(matrix?.a ?? 0)
    })
  expect(nativeTextSize).toBeGreaterThanOrEqual(12)
  await control(deck, "Zoom in").click()
  await expect(zoom(deck)).toHaveText("125%")
  await control(deck, "Zoom out").click()
  await expect(zoom(deck)).toHaveText("100%")
  await control(deck, "Fit to screen").click()
  expect(await percentage(deck)).toBe(fitted)
  await control(deck, "Reset zoom").click()
  for (let count = 0; count < 10 && (await control(deck, "Zoom in").isEnabled()); count++)
    await control(deck, "Zoom in").click()
  await expect(zoom(deck)).toHaveText("400%")
  await expect(control(deck, "Zoom in")).toBeDisabled()
  for (let count = 0; count < 60 && (await control(deck, "Zoom out").isEnabled()); count++)
    await control(deck, "Zoom out").click()
  await expect(control(deck, "Zoom out")).toBeDisabled()
  expect(await percentage(deck)).toBe(Math.min(25, fitted))
})

test("resize refits a complete graph and preserves manual zoom until Fit is selected", async ({
  page,
  request,
}) => {
  const content = documentFixture()
  getDeck(content, "first").slides[0].mermaid = wideSource()
  await page.goto((await save(request, content)).url)
  const deck = page.locator('[data-block-id="first"]')
  await rendered(deck)
  await openDiagramControls(deck)
  const initial = await percentage(deck)
  await page.setViewportSize({ width: 640, height: 700 })
  await expect.poll(() => percentage(deck)).toBeLessThan(initial)
  await expectGraphInsideViewport(deck)
  await control(deck, "Reset zoom").click()
  await control(deck, "Zoom in").click()
  await expect(zoom(deck)).toHaveText("125%")
  const camera = await deck.locator(".diagram-svg").getAttribute("style")
  await page.setViewportSize({ width: 960, height: 820 })
  await expect(deck.locator(".diagram-svg")).not.toHaveAttribute("style", camera ?? "")
  await expect(zoom(deck)).toHaveText("125%")
  await control(deck, "Fit to screen").click()
  await expect.poll(() => percentage(deck)).toBeLessThan(100)
  await expectGraphInsideViewport(deck)
})

for (const width of [390, 1280]) {
  test(`inline frames follow content, stay bounded, and preserve the fullscreen camera at ${width}px`, async ({
    page,
    request,
  }) => {
    await rejectFullscreen(page)
    await page.setViewportSize({ width, height: 960 })
    const content = documentFixture()
    const slides = getDeck(content, "first").slides
    slides[0].mermaid = "flowchart LR\n A[Input] --> B[Output]"
    slides[1].mermaid = `flowchart TD\n${Array.from({ length: 10 }, (_, i) => `N${i}[Step ${i}] --> N${i + 1}`).join("\n")}`
    slides[2].mermaid = `flowchart LR\n${Array.from({ length: 3 }, (_, i) => `A${i}[Input ${i}] --> B${i}[Check ${i}] --> C${i}[Output ${i}]`).join("\n")}`
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto((await save(request, content)).url)
    const deck = page.locator('[data-block-id="first"]')
    const viewport = deck.locator(".diagram-viewport")
    const height = () => viewport.evaluate((node) => node.clientHeight)
    await rendered(deck)
    const inlineHeight = await height()
    expect(inlineHeight).toBeGreaterThanOrEqual(96)
    expect(inlineHeight).toBeLessThan(180)
    const spacing = await viewport.evaluate((node) => {
      const style = getComputedStyle(node)
      return [style.marginTop, style.marginBottom]
    })
    expect(spacing).toEqual(["0px", "0px"])
    const controls = await deck.locator(".diagram-controls").boundingBox()
    const frame = await viewport.boundingBox()
    expect(frame?.y).toBe((controls?.y ?? 0) + (controls?.height ?? 0))
    await expectGraphInsideViewport(deck)
    await openDiagramControls(deck)
    await control(deck, "Reset zoom").click()
    await control(deck, "Zoom in").click()
    await expect(zoom(deck)).toHaveText("125%")
    expect(await height()).toBe(inlineHeight)
    await control(deck, "Show source").click()
    await expect(deck.locator(".diagram-source code")).toHaveText(slides[0].mermaid)
    await control(deck, "Show diagram").click()
    await expect(zoom(deck)).toHaveText("125%")
    expect(await height()).toBe(inlineHeight)
    const graphic = await deck.locator(".diagram-svg > svg").elementHandle()
    await control(deck, "Fullscreen").click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect.poll(height).toBeGreaterThan(700)
    await expect(zoom(deck)).toHaveText("125%")
    expect(await graphic?.evaluate((node) => node.isConnected)).toBe(true)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect.poll(height).toBe(inlineHeight)
    await expect(zoom(deck)).toHaveText("125%")
    await selectSlide(deck, "detail")
    await rendered(deck)
    await expect.poll(height).toBe(576)
    await expectGraphInsideViewport(deck)
    await selectSlide(deck, "overview")
    await rendered(deck)
    await expect.poll(height).toBe(inlineHeight)
    await selectSlide(deck, "end")
    await rendered(deck)
    const responsiveHeight = await height()
    await page.setViewportSize({ width: width === 390 ? 1280 : 390, height: 960 })
    await expect.poll(height).not.toBe(responsiveHeight)
    await expectGraphInsideViewport(deck)
    // Let ResizeObserver settle after replacing and resizing the graphs.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    expect(errors).toEqual([])
  })
}

test("drag and modified wheel control the camera; normal wheel scrolls and source stays inert", async ({
  page,
  request,
}) => {
  const content = documentFixture()
  const source = wideSource()
  getDeck(content, "first").slides[0].mermaid = source
  await page.goto((await save(request, content)).url)
  const deck = page.locator('[data-block-id="first"]')
  await rendered(deck)
  await openDiagramControls(deck)
  await control(deck, "Reset zoom").click()
  const viewport = deck.locator(".diagram-viewport")
  const stage = deck.locator(".diagram-svg")
  const before = await stage.getAttribute("style")
  await viewport.scrollIntoViewIfNeeded()
  const box = await viewport.boundingBox()
  if (!box) throw new Error("Missing viewport")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(stage).not.toHaveAttribute("style", before ?? "")
  const panned = await stage.getAttribute("style")
  const scroll = await page.evaluate(() => scrollY)
  await page.mouse.wheel(0, 120)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll)
  await expect(stage).toHaveAttribute("style", panned ?? "")
  await viewport.scrollIntoViewIfNeeded()
  await viewport.hover()
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, -160)
  await page.keyboard.up("Control")
  await expect.poll(() => percentage(deck)).toBeGreaterThan(100)
  await control(deck, "Show source").click()
  await expect(deck.locator(".diagram-source code")).toHaveText(source)
  await expect(viewport).toBeHidden()
  for (const name of ["Zoom out", "Zoom in", "Fit to screen", "Reset zoom"])
    await expect(control(deck, name)).toBeDisabled()
  const sourceCamera = await stage.getAttribute("style")
  await viewport.dispatchEvent("wheel", { deltaY: -120, ctrlKey: true })
  await expect(stage).toHaveAttribute("style", sourceCamera ?? "")
  await expect(deck.locator(".diagram-source svg, .diagram-source script")).toHaveCount(0)
  await control(deck, "Show diagram").click()
  await viewport.focus()
  await page.keyboard.press("0")
  expect(await percentage(deck)).toBeLessThan(100)
  await page.keyboard.press("+")
  const increased = await percentage(deck)
  await page.keyboard.press("-")
  expect(await percentage(deck)).toBeLessThan(increased)
  // Unmodified arrows still belong to the parent deck, not the camera.
  await page.keyboard.press("ArrowRight")
  await rendered(deck)
  await expect(deck).toHaveAttribute("data-slide-id", "detail")
})

test("source remains inert text when a compromised response fails the rendering policy", async ({
  page,
  request,
}) => {
  const content = documentFixture()
  const fixture = await save(request, content)
  const source = 'flowchart LR\n A["<img src=/assets/source-sentinel onerror=alert(1)>"]'
  getDeck(content, "first").slides[0].mermaid = source
  const resources: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("source-sentinel")) resources.push(request.url())
  })
  await page.route("**/api/documents/**", async (route) => {
    const response = await route.fetch()
    if (response.status() === 304) return route.fulfill({ response })
    const stored = await response.json()
    await route.fulfill({ response, json: { ...stored, document: content } })
  })
  await page.goto(fixture.url)
  const deck = page.locator('[data-block-id="first"]')
  await expect(deck.getByRole("alert")).toContainText("Block first, slide overview")
  await expect(deck.locator("pre code")).toHaveText(source)
  await openDiagramControls(deck)
  await control(deck, "Show source").click()
  await expect(deck.locator("pre code")).toHaveCount(1)
  await expect(deck.locator("pre code")).toHaveText(source)
  await expect(deck.locator("img, script, [onerror]")).toHaveCount(0)
  await expect(control(deck, "Show diagram")).toBeEnabled()
  expect(resources).toEqual([])
  await rendered(page.locator('[data-block-id="second"]'))
})

test("native fullscreen uses the same SVG and restores focus after browser exit", async ({
  page,
  request,
}) => {
  await page.goto((await save(request, documentFixture())).url)
  const deck = page.locator('[data-block-id="first"]')
  await rendered(deck)
  test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), "Native API unavailable")
  const graphic = await deck.locator(".diagram-svg > svg").elementHandle()
  const inlineHeight = await deck.locator(".diagram-viewport").evaluate((node) => node.clientHeight)
  await openDiagramControls(deck)
  await control(deck, "Reset zoom").click()
  await control(deck, "Zoom in").click()
  const button = control(deck, "Fullscreen")
  await button.click()
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.className))
    .toBe("diagram")
  await expect(control(deck, "Exit fullscreen")).toBeVisible()
  await expect
    .poll(() => deck.locator(".diagram-viewport").evaluate((node) => node.clientHeight))
    .toBeGreaterThan(inlineHeight)
  await expect(zoom(deck)).toHaveText("125%")
  expect(await graphic?.evaluate((node) => node.isConnected)).toBe(true)
  const disclosure = control(deck, "More controls")
  await expect(disclosure).toHaveAttribute("aria-expanded", "true")
  await disclosure.focus()
  await page.keyboard.press("Enter")
  await expect(deck.locator(".diagram-secondary-controls")).toBeHidden()
  await page.keyboard.press("Tab")
  await expect(deck.locator(".diagram-viewport")).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Space")
  await expect(disclosure).toHaveAttribute("aria-expanded", "true")
  await expect(zoom(deck)).toHaveText("125%")
  await page.evaluate(() => document.exitFullscreen())
  await expect(control(deck, "Fullscreen")).toBeFocused()
  await expect
    .poll(() => deck.locator(".diagram-viewport").evaluate((node) => node.clientHeight))
    .toBe(inlineHeight)
  await expect(zoom(deck)).toHaveText("125%")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("")
})

for (const change of ["source replacement", "unmount"] as const) {
  test(`active native fullscreen closes on ${change} without hiding another deck`, async ({
    page,
    request,
  }) => {
    const content = documentFixture()
    const fixture = await save(request, content)
    await page.goto(fixture.url)
    const deck = page.locator('[data-block-id="first"]')
    const other = page.locator('[data-block-id="second"]')
    await rendered(deck)
    await rendered(other)
    test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), "Native API unavailable")
    await openDiagramControls(deck)
    await control(deck, "Fullscreen").click()
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.className))
      .toBe("diagram")
    if (change === "unmount")
      content.blocks = content.blocks.filter((block) => block.id !== "first")
    else
      getDeck(content, "first").slides[0].mermaid = "flowchart LR\n New[Native cleanup] --> Saved"
    await save(request, content, fixture.stored)
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    if (change === "unmount") await expect(deck).toHaveCount(0)
    else {
      await expect(
        deck.locator(".diagram-svg > svg .rough-node").filter({ hasText: /Native\s*cleanup/ }),
      ).toHaveCount(1)
      await expect(control(deck, "More controls")).toHaveAttribute("aria-expanded", "false")
      await expect(deck.locator(".diagram-secondary-controls")).toBeHidden()
      await expect(control(deck, "Fullscreen")).toBeFocused()
    }
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("")
    expect(await other.evaluate((node) => (node as HTMLElement).inert)).toBe(false)
    await other.focus()
    await expect(other).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(other).toHaveAttribute("data-slide-id", "detail")
  })
}

test("rejected fullscreen isolates the background, traps focus, and restores styles on Escape", async ({
  page,
  request,
}) => {
  await rejectFullscreen(page)
  await page.goto((await save(request, documentFixture())).url)
  const deck = page.locator('[data-block-id="first"]')
  await rendered(deck)
  const graphic = await deck.locator(".diagram-svg > svg").elementHandle()
  await page.evaluate(() => {
    document.body.style.setProperty("overflow", "scroll", "important")
    document.documentElement.style.overflow = "auto"
    const intro = document.querySelector<HTMLElement>('[data-block-id="intro"]')
    if (intro) intro.inert = true
  })
  await control(deck, "Fullscreen").click()
  const dialog = page.getByRole("dialog", { name: "Diagram for slide overview" })
  await expect(dialog).toHaveAttribute("aria-modal", "true")
  await expect(deck.locator(".diagram-viewport")).toBeFocused()
  expect(await graphic?.evaluate((node) => node.isConnected)).toBe(true)
  expect(
    await page.locator('[data-block-id="second"]').evaluate((node) => (node as HTMLElement).inert),
  ).toBe(true)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden")
  const disclosure = control(deck, "More controls")
  await expect(disclosure).toHaveAttribute("aria-expanded", "false")
  await expect(deck.locator(".diagram-secondary-controls")).toBeHidden()
  await control(deck, "Fit to screen").focus()
  await page.keyboard.press("Shift+Tab")
  await expect(deck.locator(".diagram-viewport")).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(control(deck, "Fit to screen")).toBeFocused()
  await disclosure.focus()
  await page.keyboard.press("Tab")
  await expect(deck.locator(".diagram-viewport")).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(disclosure).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(deck.locator(".diagram-secondary-controls")).toBeVisible()
  await page.keyboard.press("Tab")
  await expect(control(deck, "Zoom out")).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(disclosure).toBeFocused()
  await page.keyboard.press("Space")
  await expect(deck.locator(".diagram-secondary-controls")).toBeHidden()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(control(deck, "Fullscreen")).toBeFocused()
  expect(await page.evaluate(() => document.body.style.getPropertyValue("overflow"))).toBe("scroll")
  expect(await page.evaluate(() => document.body.style.getPropertyPriority("overflow"))).toBe(
    "important",
  )
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("auto")
  expect(
    await page.locator('[data-block-id="intro"]').evaluate((node) => (node as HTMLElement).inert),
  ).toBe(true)
  expect(
    await page.locator('[data-block-id="second"]').evaluate((node) => (node as HTMLElement).inert),
  ).toBe(false)
})

test("unavailable fullscreen closes safely on source replacement and error recovery stays local", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "requestFullscreen", { value: undefined })
  })
  const content = documentFixture()
  const fixture = await save(request, content)
  await page.goto(fixture.url)
  const deck = page.locator('[data-block-id="first"]')
  const other = page.locator('[data-block-id="second"]')
  await rendered(deck)
  await rendered(other)
  await openDiagramControls(deck)
  await control(deck, "Reset zoom").click()
  await control(deck, "Zoom in").click()
  await control(deck, "Fullscreen").click()
  await expect(page.getByRole("dialog")).toBeVisible()
  getDeck(content, "first").slides[0].mermaid = "flowchart LR\n A[unterminated"
  const broken = await save(request, content, fixture.stored)
  await expect(deck.getByRole("alert")).toContainText("Block first, slide overview")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(deck.locator("pre code")).toHaveCount(1)
  await expect(deck.locator("pre code")).toHaveText(getDeck(content, "first").slides[0].mermaid)
  await expect(control(deck, "More controls")).toHaveAttribute("aria-expanded", "false")
  await expect(deck.locator(".diagram-secondary-controls")).toBeHidden()
  await openDiagramControls(deck)
  await expect(control(deck, "Reset zoom")).toBeDisabled()
  await expect(control(deck, "Zoom in")).toBeDisabled()
  await control(deck, "Show source").click()
  await expect(deck.locator("pre code")).toHaveCount(1)
  await rendered(other)
  expect(await other.evaluate((node) => (node as HTMLElement).inert)).toBe(false)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("")
  getDeck(content, "first").slides[0].mermaid = 'flowchart LR\n Fresh["Fresh source"] --> Ready'
  await save(request, content, broken.stored)
  await rendered(deck)
  await expect(deck.locator(".diagram-svg > svg")).toContainText("Fresh source")
  await expect(control(deck, "More controls")).toHaveAttribute("aria-expanded", "false")
  await openDiagramControls(deck)
  await expect(control(deck, "Show source")).toBeVisible()
  await expect(control(deck, "Zoom in")).toBeEnabled()
  await expect(deck.locator("pre code")).toHaveCount(0)
  await expect(zoom(deck)).not.toHaveText("125%")
})

test("unmount closes the fallback without leaving scroll locks, inert siblings, or focus traps", async ({
  page,
  request,
}) => {
  await rejectFullscreen(page)
  const content = documentFixture()
  const fixture = await save(request, content)
  await page.goto(fixture.url)
  const deck = page.locator('[data-block-id="first"]')
  await rendered(deck)
  await openDiagramControls(deck)
  await control(deck, "Fullscreen").click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(deck.locator(".diagram-secondary-controls")).toBeVisible()
  content.blocks = content.blocks.filter((block) => block.id !== "first")
  await save(request, content, fixture.stored)
  await expect(deck).toHaveCount(0)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("")
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("")
  const other = page.locator('[data-block-id="second"]')
  expect(await other.evaluate((node) => (node as HTMLElement).inert)).toBe(false)
  await expect(control(other, "More controls")).toHaveAttribute("aria-expanded", "false")
  await expect(other.locator(".diagram-secondary-controls")).toBeHidden()
  await other.focus()
  await expect(other).toBeFocused()
  await page.keyboard.press("ArrowRight")
  await rendered(other)
  await expect(other).toHaveAttribute("data-slide-id", "detail")
})

for (const outcome of ["resolve", "reject"] as const) {
  test(`a pending native fullscreen ${outcome} after unmount cannot reopen or retain fullscreen`, async ({
    page,
    request,
  }) => {
    await page.addInitScript(() => {
      let active: Element | null = null
      Object.defineProperty(document, "fullscreenElement", { get: () => active })
      Element.prototype.requestFullscreen = function () {
        return new Promise<void>((resolve, reject) => {
          Reflect.set(window, "settleSketchbookFullscreen", (outcome: string) => {
            if (outcome === "reject") reject(new Error("Late rejection"))
            else {
              active = this
              document.dispatchEvent(new Event("fullscreenchange"))
              resolve()
            }
          })
        })
      }
      document.exitFullscreen = async () => {
        active = null
        document.dispatchEvent(new Event("fullscreenchange"))
      }
    })
    const content = documentFixture()
    const fixture = await save(request, content)
    await page.goto(fixture.url)
    const deck = page.locator('[data-block-id="first"]')
    await rendered(deck)
    await openDiagramControls(deck)
    await control(deck, "Fullscreen").click()
    await expect(control(deck, "Fullscreen")).toBeDisabled()
    content.blocks = content.blocks.filter((block) => block.id !== "first")
    await save(request, content, fixture.stored)
    await expect(deck).toHaveCount(0)
    await page.evaluate(
      (outcome) => Reflect.get(window, "settleSketchbookFullscreen")(outcome),
      outcome,
    )
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("")
    expect(
      await page
        .locator('[data-block-id="second"]')
        .evaluate((node) => (node as HTMLElement).inert),
    ).toBe(false)
  })
}
