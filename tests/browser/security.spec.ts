import { expect, test } from "@playwright/test"
import { documentFixture, getDeck, openDiagramControls, rendered, save } from "./helpers.js"

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

test("Mermaid and formula errors stay local, include IDs and source, and recover", async ({
  page,
  request,
}) => {
  const document = documentFixture()
  document.blocks.unshift({
    id: "bad-math",
    type: "markdown",
    markdown: "Invalid $\\notARealKatexCommand{x}$ and recursive $\\def\\loop{\\loop}\\loop$.",
  })
  const first = getDeck(document, "first")
  first.slides[0].mermaid = "flowchart LR\n A[unterminated"
  first.slides[1].explanationMarkdown = "Invalid formula $\\frac{a}{$."
  const fixture = await save(request, document)
  await page.goto(fixture.url)
  const deck = page.locator('[data-block-id="first"]')
  await expect(deck.getByRole("alert")).toContainText("Block first, slide overview")
  await expect(deck.locator("pre code")).toHaveText(first.slides[0].mermaid)
  await expect(deck.getByRole("button", { name: "More controls" })).toHaveAttribute(
    "aria-expanded",
    "false",
  )
  await expect(deck.locator(".diagram-secondary-controls")).toBeHidden()
  await openDiagramControls(deck)
  await expect(deck.getByRole("button", { name: "Fit to screen" })).toBeDisabled()
  for (const name of ["Zoom out", "Zoom in", "Reset zoom"])
    await expect(deck.getByRole("button", { name, exact: true })).toBeDisabled()
  await deck.getByRole("button", { name: "Show source", exact: true }).click()
  await expect(deck.locator("pre code")).toHaveCount(1)
  await expect(deck.locator("pre code")).toHaveText(first.slides[0].mermaid)
  await deck.getByRole("button", { name: "Show diagram", exact: true }).click()
  await expect(deck.locator("pre code")).toHaveCount(1)
  const math = page.locator('[data-block-id="bad-math"]')
  await expect(math.getByRole("alert")).toHaveCount(2)
  await expect(math.getByRole("alert").last()).toContainText(
    /Too many expansions|infinite loop|expansion/i,
  )
  await expect(math).toContainText("Block bad-math")
  await rendered(page.locator('[data-block-id="second"]'))
  await expect(page.getByText("Last text stays readable.")).toBeVisible()
  await deck.getByRole("button", { name: "Next slide" }).click()
  await rendered(deck)
  await expect(deck.getByRole("button", { name: "More controls" })).toHaveAttribute(
    "aria-expanded",
    "false",
  )
  await expect(deck.locator(".diagram-source")).toHaveCount(0)
  await expect(deck.getByRole("alert")).toContainText("Block first, slide detail: Formula error")
  await expect(deck.locator(".render-error code")).toContainText("\\frac{a}{")
  await deck.getByRole("button", { name: "Next slide" }).click()
  await rendered(deck)
  await expect(deck.getByRole("alert")).toHaveCount(0)
})

test("stored policy rejects Mermaid configuration, callbacks, external assets and CSS loads", async ({
  request,
}) => {
  for (const mermaid of [
    "---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\n A-->B",
    '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n A-->B',
    'flowchart LR\n A-->B\n click A "https://external.invalid/"',
    'flowchart LR\n A@{img:"https://external.invalid/image.png"}',
    "flowchart LR\n A-->B\n classDef remote fill:url(https://external.invalid/fill.svg);",
    'flowchart LR\n A["<img src=https://external.invalid/raw.png>"]',
    "sequenceDiagram\n A->>B: unsupported",
  ]) {
    const document = documentFixture()
    getDeck(document, "first").slides[0].mermaid = mermaid
    const response = await request.post("http://127.0.0.1:4179/documents", { data: { document } })
    expect(response.status(), mermaid).toBe(400)
  }
})

test("quoted and escaped Mermaid metadata is rejected before renderer resource requests", async ({
  page,
  request,
}) => {
  const document = documentFixture()
  const fixture = await save(request, document)
  getDeck(document, "first").slides[0].mermaid =
    'flowchart LR\n A@{ "img": "/assets/metadata-sentinel.svg" }'
  getDeck(document, "second").slides[0].mermaid = String.raw`flowchart LR
 A@{ "\u0069mg": "/assets/metadata-sentinel.svg" }`
  const resourceRequests: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("metadata-sentinel")) resourceRequests.push(request.url())
  })
  await page.route("**/api/documents/**", async (route) => {
    const response = await route.fetch()
    if (response.status() === 304) return route.fulfill({ response })
    const stored = await response.json()
    await route.fulfill({ response, json: { ...stored, document } })
  })
  await page.goto(fixture.url)
  for (const id of ["first", "second"]) {
    await expect(page.locator(`[data-block-id="${id}"]`).getByRole("alert")).toContainText(
      "node metadata",
    )
  }
  expect(resourceRequests).toEqual([])
  await expect(page.getByText("Last text stays readable.")).toBeVisible()
})

test("browser defense rejects config overrides and sanitizes encoded labels and SVG CSS URLs", async ({
  page,
  request,
}) => {
  const document = documentFixture()
  const fixture = await save(request, document)
  // Simulate a compromised response after a valid disk-backed request. This tests
  // the independent browser boundary, not an alternate production write API.
  getDeck(document, "first").slides[0].mermaid =
    '%%{init: {"look":"classic"}}%%\nflowchart LR\n A-->B'
  getDeck(document, "second").slides[0].mermaid = [
    "flowchart LR",
    ' A["&lt;img src=&quot;/assets/encoded-label.png&quot; onerror=&quot;alert(1)&quot;&gt;"] --> B["Safe"]',
  ].join("\n")
  const external: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== new URL(fixture.url).origin) external.push(request.url())
  })
  await page.route("**/api/documents/**", async (route) => {
    const response = await route.fetch()
    if (response.status() === 304) return route.fulfill({ response })
    const stored = await response.json()
    await route.fulfill({ response, json: { ...stored, document } })
  })
  // Inject hostile renderer output before the app's SVG boundary.
  await page.route("**/assets/flowDiagram-*.js", async (route) => {
    const response = await route.fetch()
    const script = await response.text()
    const wrapped = script.replace(
      /export\{(\w+) as diagram\}from"([^"]+)";/,
      (_match, symbol, module) => `
      import { ${symbol} as testDiagram } from "${module}";
      const originalDraw = testDiagram.renderer.draw;
      testDiagram.renderer.draw = async (...args) => {
        await originalDraw(...args);
        const svg = document.getElementById(args[1]);
        if (svg) {
          svg.querySelector("style").textContent += " .hostile { fill: url(https://external.invalid/fill.svg); }";
          const link = document.createElementNS("http://www.w3.org/2000/svg", "a");
          link.setAttribute("href", "javascript:alert(1)");
          svg.append(link);
        }
      };
      export { testDiagram as diagram };
    `,
    )
    expect(wrapped).not.toBe(script)
    await route.fulfill({ response, body: wrapped })
  })
  await page.goto(fixture.url)
  await expect(page.locator('[data-block-id="first"]').getByRole("alert")).toContainText(
    "configuration is not permitted",
  )
  const second = page.locator('[data-block-id="second"]')
  await rendered(second)
  await expect(second.locator("img, image, foreignObject, script, a, [onerror]")).toHaveCount(0)
  const svg = await second.locator(".diagram-svg > svg").innerHTML()
  expect(svg).not.toMatch(/url\([^)]*https?:/i)
  expect(external).toEqual([])
})
