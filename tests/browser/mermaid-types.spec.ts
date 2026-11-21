import { expect, type Locator, test } from "@playwright/test"
import type { DiagramDeck, SketchbookDocument } from "../../src/document.js"
import { mermaidTypeFixtures } from "../fixtures/mermaid-types.js"
import { asset, rendered, save, selectSlide } from "./helpers.js"

type Sample = { id: string; renderer: string; source: string; label: string }

function sample(id: string): Sample {
  const fixture = mermaidTypeFixtures.find((entry) => entry.id === id)
  if (!fixture) throw new Error(`Missing Mermaid fixture: ${id}`)
  return fixture
}

function deckFixture(id: string, ...samples: Sample[]): DiagramDeck {
  return {
    id,
    type: "diagram-deck",
    title: `${id} diagrams`,
    slides: samples.map(({ id, source }) => ({
      id,
      title: id,
      mermaid: source,
      explanationMarkdown: `Explanation for ${id}.`,
    })),
  }
}

function documentFixture(...blocks: DiagramDeck[]): SketchbookDocument {
  return { schemaVersion: 1, title: "Mermaid renderer fixtures", blocks }
}

const graphic = (deck: Locator) => deck.locator(".diagram-svg > svg")
const control = (deck: Locator, name: string) => deck.getByRole("button", { name, exact: true })
const zoom = (deck: Locator) => deck.getByRole("status", { name: "Current zoom" })

async function expectDiagram(deck: Locator, { id, renderer, label }: Sample) {
  await expect(deck).toHaveAttribute("data-slide-id", id)
  await rendered(deck)
  const svg = graphic(deck)
  await expect(svg).toHaveAttribute("aria-roledescription", renderer)
  await expect(deck.getByRole("alert")).toHaveCount(0)
  await expectSvgLabel(svg, label)
  const geometry = await svg.evaluate((node) => {
    const { width, height } = (node as SVGSVGElement).getBBox()
    return { width, height }
  })
  expect(geometry.width).toBeGreaterThan(0)
  expect(geometry.height).toBeGreaterThan(0)
}

async function expectSvgLabel(svg: Locator, label: string) {
  const text = svg.locator("text").filter({ hasText: label }).first()
  await expect(text, `SVG label: ${label}`).toBeVisible()
  const bounds = await text.boundingBox()
  if (!bounds) throw new Error(`Missing SVG label geometry: ${label}`)
  expect(bounds.width).toBeGreaterThan(0)
  expect(bounds.height).toBeGreaterThan(0)
  return bounds
}

async function expectFit(deck: Locator) {
  const frame = await deck.locator(".diagram-viewport").boundingBox()
  const svg = await graphic(deck).boundingBox()
  if (!frame || !svg) throw new Error("Missing diagram geometry")
  expect(svg.x).toBeGreaterThanOrEqual(frame.x - 1)
  expect(svg.y).toBeGreaterThanOrEqual(frame.y - 1)
  expect(svg.x + svg.width).toBeLessThanOrEqual(frame.x + frame.width + 1)
  expect(svg.y + svg.height).toBeLessThanOrEqual(frame.y + frame.height + 1)
}

for (const fixture of mermaidTypeFixtures) {
  test(`${fixture.id} renders an authored SVG label with ${fixture.renderer}`, async ({
    page,
    request,
  }) => {
    const content = documentFixture(deckFixture("matrix", fixture))
    const { url } = await save(request, content)
    const origin = new URL(url).origin
    const extraRequests: string[] = []
    page.on("request", (request) => {
      const target = new URL(request.url())
      if (
        target.origin !== origin ||
        !["document", "script", "stylesheet", "font", "fetch"].includes(request.resourceType())
      ) {
        extraRequests.push(`${request.resourceType()}: ${target.pathname}`)
      }
    })
    await page.goto(url)
    const deck = page.locator('[data-block-id="matrix"]')
    await expectDiagram(deck, fixture)
    await expectFit(deck)
    await expect(
      graphic(deck).locator("a, image, feImage, foreignObject, script, [href]"),
    ).toHaveCount(0)
    expect(extraRequests).toEqual([])
  })
}

const flowchart = sample("flowchart")
const sequence = sample("sequenceDiagram")
const chart = sample("xychart")
const wideSequence: Sample = {
  ...sequence,
  source: `sequenceDiagram
participant Client
participant Gateway
participant Service
participant Database
participant Queue
participant Worker
Client->>Gateway: Request
Gateway->>Service: Read
Service->>Database: Find record
Service->>Queue: Enqueue
Queue->>Worker: Process record
Gateway-->>Client: Response`,
}

for (const width of [390, 1440]) {
  test(`mixed deck switches renderer and keeps usable camera and layout at ${width}px`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const content = documentFixture(deckFixture("mixed", flowchart, wideSequence, chart))
    await page.goto((await save(request, content)).url)
    const deck = page.locator('[data-block-id="mixed"]')
    await expectDiagram(deck, flowchart)
    await control(deck, "Next slide").click()
    await expectDiagram(deck, wideSequence)
    await expect(deck.locator(".slide-explanation")).toHaveText("Explanation for sequenceDiagram.")
    const fitted = (await zoom(deck).textContent()) ?? ""
    expect(Number.parseInt(fitted, 10)).toBeGreaterThan(0)
    expect(Number.parseInt(fitted, 10)).toBeLessThan(100)
    await expectFit(deck)

    await control(deck, "Reset zoom").click()
    await expect(zoom(deck)).toHaveText("100%")
    const native = await graphic(deck).boundingBox()
    await control(deck, "Zoom in").click()
    await expect(zoom(deck)).toHaveText("125%")
    const magnified = await graphic(deck).boundingBox()
    expect(magnified?.width).toBeGreaterThan(native?.width ?? 0)
    await control(deck, "Zoom out").click()
    await expect(zoom(deck)).toHaveText("100%")
    await control(deck, "Fit to screen").click()
    await expect(zoom(deck)).toHaveText(fitted)
    await expectFit(deck)

    await control(deck, "Show source").click()
    const source = deck.getByRole("region", { name: "Diagram source" })
    await expect(source).toBeVisible()
    expect(await source.textContent()).toBe(wideSequence.source)
    await expect(graphic(deck)).toBeHidden()
    await expect(control(deck, "Zoom in")).toBeDisabled()
    await control(deck, "Show diagram").click()
    await expectDiagram(deck, wideSequence)
    await expect(zoom(deck)).toHaveText(fitted)

    await control(deck, "Zoom in").click()
    await control(deck, "Show source").click()
    await selectSlide(deck, chart.id)
    await expectDiagram(deck, chart)
    await expect(source).toHaveCount(0)
    await expect(control(deck, "Next slide")).toBeDisabled()
    await expectFit(deck)
    const figure = await deck.locator(".slide-figure").boundingBox()
    const explanation = await deck.locator(".slide-explanation").boundingBox()
    if (!figure || !explanation) throw new Error("Missing slide layout")
    if (width === 390) {
      expect(explanation.y).toBeGreaterThanOrEqual(figure.y + figure.height - 1)
    } else {
      expect(explanation.x).toBeGreaterThanOrEqual(figure.x + figure.width - 1)
      expect(Math.abs(explanation.y - figure.y)).toBeLessThanOrEqual(1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await deck.screenshot({
      path: testInfo.outputPath(`mixed-xychart-${width}.png`),
      animations: "disabled",
      scale: "css",
    })

    await control(deck, "Previous slide").click()
    await expectDiagram(deck, wideSequence)
    await expect(zoom(deck)).toHaveText(fitted)
    await control(deck, "Previous slide").click()
    await expectDiagram(deck, flowchart)
  })

  test(`the bundled sequence walkthrough renders at ${width}px`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const content = await asset(request, "sequence-walkthrough")
    await page.goto((await save(request, content)).url)
    const deck = page.locator('[data-block-id="sequence-order"]')
    await expectDiagram(deck, { ...sequence, id: "sequence-request", label: "Client" })
    await expectSvgLabel(graphic(deck), "Service")
    const sent = await expectSvgLabel(graphic(deck), "Request")
    const received = await expectSvgLabel(graphic(deck), "Response")
    expect(sent.y).toBeLessThan(received.y)
    await expectFit(deck)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await deck.screenshot({
      path: testInfo.outputPath(`sequence-walkthrough-${width}.png`),
      animations: "disabled",
      scale: "css",
    })
  })
}

test("sequence arrowheads and number badges use the message line color", async ({
  page,
  request,
}) => {
  const numbered = {
    ...sequence,
    source: "sequenceDiagram\nautonumber\nClient->>Server: Request\nServer-->>Client: Response",
  }
  const content = documentFixture(deckFixture("numbered", numbered))
  await page.goto((await save(request, content)).url)
  const deck = page.locator('[data-block-id="numbered"]')
  await expectDiagram(deck, numbered)
  const svg = graphic(deck)
  await expect(svg.locator(".sequenceNumber").first()).toHaveText("1")
  const colors = await svg.evaluate((node) => {
    const message = node.querySelector(".messageLine0[marker-end]")
    const badgeLine = node.querySelector('line[marker-start][stroke-width="0"]')
    if (!message || !badgeLine) throw new Error("Missing sequence marker references")
    const marker = (line: Element, attribute: string, shape: string) => {
      const id = /^url\(#([\w:.-]+)\)$/.exec(line.getAttribute(attribute) ?? "")?.[1]
      const target = id && node.querySelector(`defs marker#${CSS.escape(id)} ${shape}`)
      if (!target) throw new Error(`Missing local ${shape} for ${attribute}`)
      return getComputedStyle(target)
    }
    const arrow = marker(message, "marker-end", "path")
    const badge = marker(badgeLine, "marker-start", "circle")
    return {
      signal: getComputedStyle(message).stroke,
      arrowFill: arrow.fill,
      arrowStroke: arrow.stroke,
      badgeFill: badge.fill,
    }
  })
  expect(colors.signal).not.toBe("none")
  expect([colors.arrowFill, colors.arrowStroke, colors.badgeFill]).toEqual(
    Array.from({ length: 3 }, () => colors.signal),
  )
})

test("duplicate sequence diagrams keep their artwork and controls independent", async ({
  page,
  request,
}) => {
  const content = documentFixture(
    deckFixture("first", sequence, chart),
    deckFixture("second", sequence, chart),
  )
  await page.goto((await save(request, content)).url)
  const first = page.locator('[data-block-id="first"]')
  const second = page.locator('[data-block-id="second"]')
  await expectDiagram(first, sequence)
  await expectDiagram(second, sequence)
  const ids = await page
    .locator(".diagram-svg > svg[id], .diagram-svg > svg [id]")
    .evaluateAll((nodes) => nodes.map((node) => node.id))
  expect(ids.length).toBeGreaterThan(2)
  expect(new Set(ids).size).toBe(ids.length)
  for (const deck of [first, second]) {
    const localMarkers = await graphic(deck).evaluate((svg) => {
      const ids = new Set([...svg.querySelectorAll("defs marker[id]")].map((node) => node.id))
      return [...svg.querySelectorAll("[marker-end]")].map((node) => {
        const reference = /^url\(#([\w-]+)\)$/.exec(node.getAttribute("marker-end") ?? "")
        return !!reference && ids.has(reference[1])
      })
    })
    expect(localMarkers.length).toBeGreaterThan(0)
    expect(localMarkers).not.toContain(false)
  }
  const secondZoom = (await zoom(second).textContent()) ?? ""
  const secondId = (await graphic(second).getAttribute("id")) ?? ""

  await control(first, "Reset zoom").click()
  await control(first, "Zoom in").click()
  await expect(zoom(first)).toHaveText("125%")
  await control(first, "Show source").click()
  await expect(graphic(first)).toBeHidden()
  await expectDiagram(second, sequence)
  await expect(zoom(second)).toHaveText(secondZoom)
  await selectSlide(first, chart.id)
  await expectDiagram(first, chart)
  await expectDiagram(second, sequence)
  await expect(graphic(second)).toHaveAttribute("id", secondId)
  await expect(zoom(second)).toHaveText(secondZoom)
})

test("rapid cross-renderer changes and a live revision cannot display a stale diagram", async ({
  page,
  request,
}) => {
  const pie = sample("pie")
  const model = deckFixture("rapid", flowchart, sequence, chart, pie)
  const content = documentFixture(model)
  const saved = await save(request, content)
  const pendingChunk = "**/assets/sequenceDiagram-*.js"
  const gate = Promise.withResolvers<void>()
  await page.route(pendingChunk, async (route) => {
    await gate.promise
    await route.continue()
  })
  await page.goto(saved.url)
  const deck = page.locator('[data-block-id="rapid"]')
  await expectDiagram(deck, flowchart)
  const renderedTypes = await deck.locator(".diagram-svg").evaluateHandle((host) => {
    const types: (string | null)[] = []
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof SVGSVGElement) types.push(node.getAttribute("aria-roledescription"))
        }
      }
    })
    observer.observe(host, { childList: true })
    return { types, observer }
  })
  const latest: Sample = {
    ...pie,
    id: chart.id,
    label: "Delivered",
    source: 'pie\n "Delivered" : 8',
  }
  try {
    const started = page.waitForRequest(pendingChunk)
    await selectSlide(deck, sequence.id)
    await started
    await expect(deck.locator(".diagram")).toHaveAttribute("aria-busy", "true")
    await selectSlide(deck, pie.id)
    await selectSlide(deck, chart.id)
    model.slides[2].mermaid = latest.source
    await save(request, content, saved.stored)
    await expect(page.locator(".revision")).toContainText("Revision 2")
    await expect(deck).toHaveAttribute("data-slide-id", latest.id)
  } finally {
    gate.resolve()
  }
  await expectDiagram(deck, latest)
  expect(
    await renderedTypes.evaluate(({ types, observer }) => {
      observer.disconnect()
      return types
    }),
  ).toEqual([latest.renderer])
  await renderedTypes.dispose()
})

test("a malformed sequence body fails locally and a stored revision repairs the selected slide", async ({
  page,
  request,
}) => {
  const broken: Sample = { ...sequence, id: "broken", source: "sequenceDiagram\nClient->>" }
  const model = deckFixture("repair", flowchart, broken)
  const content = documentFixture(model, deckFixture("healthy", chart))
  const saved = await save(request, content)
  await page.goto(saved.url)
  const deck = page.locator('[data-block-id="repair"]')
  const healthy = page.locator('[data-block-id="healthy"]')
  await expectDiagram(deck, flowchart)
  await selectSlide(deck, broken.id)
  const error = deck.getByRole("alert")
  await expect(error).toContainText("Block repair, slide broken:")
  expect(await deck.getByRole("region", { name: "Diagram source" }).textContent()).toBe(
    broken.source,
  )
  await expect(graphic(deck)).toHaveCount(0)
  await expectDiagram(healthy, chart)

  await control(deck, "Previous slide").click()
  await expectDiagram(deck, flowchart)
  await selectSlide(deck, broken.id)
  await expect(error).toBeVisible()
  model.slides[1].mermaid = sequence.source
  await save(request, content, saved.stored)
  await expect(page.locator(".revision")).toContainText("Revision 2")
  await expectDiagram(deck, { ...sequence, id: broken.id })
  await expect(deck.getByRole("region", { name: "Diagram source" })).toHaveCount(0)
  await expectDiagram(healthy, chart)
})
