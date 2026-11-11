import { expect, test } from "@playwright/test"
import type { SketchbookDocument } from "../../src/document.js"
import { documentFixture, getDeck, rendered, save, selectSlide } from "./helpers.js"

test("footnote navigation keeps the capability, moves focus, and survives reload", async ({
  page,
  request,
}) => {
  const document: SketchbookDocument = {
    schemaVersion: 1,
    title: "Footnote navigation",
    blocks: [
      {
        id: "notes",
        type: "markdown",
        markdown:
          "A claim[^1]. Again[^1].\n\n[^1]: Supporting detail.\n\n[Missing target](#missing) and [Malformed fragment](#%zz).",
      },
    ],
  }
  const fixture = await save(request, document)
  await page.goto(fixture.url)
  const block = page.locator('[data-block-id="notes"]')
  const references = block.locator("a[data-footnote-ref]")
  await expect(references).toHaveCount(2)
  const note = block.locator(".footnotes li")
  const noteId = await note.getAttribute("id")
  expect(noteId).toBeTruthy()
  for (const reference of await references.all()) {
    const referenceId = await reference.getAttribute("id")
    expect(referenceId).toBeTruthy()
    await expect(reference).toHaveAttribute("href", `#${noteId}`)
    const labelId = await reference.getAttribute("aria-describedby")
    expect(labelId).toBeTruthy()
    expect(
      await reference.evaluate((node) => {
        const id = node.getAttribute("aria-describedby")
        return id ? node.ownerDocument.getElementById(id)?.textContent : null
      }),
    ).toBe("Footnotes")
    await reference.focus()
    await page.keyboard.press("Enter")
    await expect(note).toBeFocused()
    expect(page.url()).toBe(fixture.url)
    const backlink = note.locator(`a[href="#${referenceId}"]`)
    await expect(backlink).toHaveAccessibleName(/Back to reference/)
    await backlink.click()
    await expect(reference).toBeFocused()
    expect(page.url()).toBe(fixture.url)
  }
  for (const name of ["Missing target", "Malformed fragment"]) {
    await block.getByRole("link", { name, exact: true }).click()
    expect(page.url()).toBe(fixture.url)
  }
  await page.reload()
  await expect(page.locator(".connection-status")).toHaveText("Connected")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(document.title)
  await expect(references).toHaveCount(2)
})

test("encoded footnote identifiers keep working without changing the viewer URL", async ({
  page,
  request,
}) => {
  const fixture = await save(request, {
    schemaVersion: 1,
    title: "Encoded footnotes",
    blocks: [
      {
        id: "notes",
        type: "markdown",
        markdown: [
          "Details[^詳細], more[^rate%], invalid escapes[^rate%zz] and [^rate%80], and distinct notes[^a] and [^%61].",
          "[^詳細]: Unicode note.",
          "[^rate%]: Percent note.",
          "[^rate%zz]: Literal invalid escape.",
          "[^rate%80]: Literal invalid UTF-8 escape.",
          "[^a]: Plain identifier.",
          "[^%61]: Encoded identifier, distinct from a.",
        ].join("\n\n"),
      },
    ],
  })
  await page.goto(fixture.url)
  const block = page.locator('[data-block-id="notes"]')
  const references = block.locator("a[data-footnote-ref]")
  await expect(references).toHaveCount(6)
  for (const reference of await references.all()) {
    const href = await reference.getAttribute("href")
    expect(href?.startsWith("#")).toBe(true)
    const note = block.locator(`li[id="${href?.slice(1)}"]`)
    await reference.click()
    await expect(note).toBeFocused()
    await note.getByRole("link").click()
    await expect(reference).toBeFocused()
    expect(page.url()).toBe(fixture.url)
  }
})

test("independent article blocks and slide explanations have unique footnote targets", async ({
  page,
  request,
}) => {
  const document = documentFixture()
  for (const block of document.blocks) {
    if (block.type === "markdown") {
      block.markdown = `Claim ${block.id}[^1].\n\n[^1]: Note for ${block.id}.`
    } else {
      for (const slide of block.slides) {
        slide.explanationMarkdown = `Claim ${block.id}/${slide.id}[^1].\n\n[^1]: Note for ${block.id}/${slide.id}.`
      }
    }
  }
  const fixture = await save(request, document)
  await page.goto(fixture.url)
  const first = page.locator('[data-block-id="first"]')
  await rendered(first)
  await rendered(page.locator('[data-block-id="second"]'))
  const assertTargets = async () => {
    const ids = await page
      .locator(".markdown [id]")
      .evaluateAll((nodes) => nodes.map((node) => node.id))
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    for (const markdown of await page.locator(".markdown").all()) {
      const reference = markdown.locator("a[data-footnote-ref]")
      const note = markdown.locator(".footnotes li")
      const noteId = await note.getAttribute("id")
      await expect(reference).toHaveAttribute("href", `#${noteId}`)
      await reference.click()
      await expect(note).toBeFocused()
      await note.getByRole("link", { name: "Back to reference 1", exact: true }).click()
      await expect(reference).toBeFocused()
      expect(page.url()).toBe(fixture.url)
    }
  }
  await assertTargets()
  await selectSlide(first, "detail")
  await rendered(first)
  await assertTargets()
  getDeck(document, "first").slides[1].explanationMarkdown =
    "Updated claim[^1].\n\n[^1]: Updated supporting detail."
  await save(request, document, fixture.stored)
  await expect(first.locator(".slide-explanation")).toContainText("Updated supporting detail.")
  await assertTargets()
})
