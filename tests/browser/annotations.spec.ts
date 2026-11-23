import { expect, type Page, test } from "@playwright/test"
import type { SketchbookDocument } from "../../src/document.js"
import { save } from "./helpers.js"

const document: SketchbookDocument = {
  schemaVersion: 1,
  title: "Annotation fixture",
  blocks: [
    {
      id: "intro",
      type: "markdown",
      markdown: "## Pick this heading\n\n[Safe link](https://example.com/)",
    },
    {
      id: "chart",
      type: "diagram-html",
      title: "Example chart",
      html: '<!doctype html><html><body><svg viewBox="0 0 30 20" width="120" height="80"><text x="0" y="16">Chart</text></svg></body></html>',
    },
  ],
}

async function addNote(page: Page, comment: string) {
  const editor = page.getByRole("dialog", { name: "Add annotation" })
  await expect(editor.getByRole("textbox", { name: "Comment" })).toBeFocused()
  await editor.getByRole("textbox", { name: "Comment" }).fill(comment)
  await editor.getByRole("button", { name: "Add note" }).click()
  await expect(editor).not.toBeVisible()
}

test("picks a link without opening it, cancels with Esc, and manually copies notes in a read-only Viewer", async ({
  page,
  request,
}) => {
  const fixture = await save(request, document)
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", { value: undefined }),
  )
  await page.goto(fixture.url)
  const picker = page.getByRole("button", { name: "Annotate", exact: true })
  const link = page.getByRole("link", { name: "Safe link" })
  await picker.click()
  await link.hover()
  await expect(link).toHaveAttribute("data-annotation-hover", "")
  await page.keyboard.press("Escape")
  await expect(picker).toBeFocused()
  await expect(link).not.toHaveAttribute("data-annotation-hover", "")
  await picker.press("Enter")
  await link.click()
  await addNote(page, "Make this link label clearer.")
  await expect(picker).toBeFocused()
  await page.getByRole("button", { name: "Notes (1)" }).click()
  const review = page.getByRole("dialog", { name: "Annotation notes" })
  await expect(review.getByRole("button", { name: "Send to Pi" })).toHaveCount(0)
  const copy = review.getByRole("button", { name: "Copy feedback" })
  await expect(copy).toHaveCSS("background-color", "rgb(191, 69, 32)")
  await copy.click()
  const exported = await review.getByRole("textbox", { name: "Feedback text" }).inputValue()
  expect({
    document: exported.includes(fixture.stored.documentId),
    block: exported.includes('"blockId": "intro"'),
    comment: exported.includes("Make this link label clearer."),
    private: exported.includes(new URL(fixture.url).hash.slice(1)),
  }).toEqual({ document: true, block: true, comment: true, private: false })
  await review.getByRole("button", { name: "Remove note 1" }).click()
  await expect(review.getByText("No notes yet.")).toBeVisible()
})

test.use({ hasTouch: true })

test("at 390px selects through the keyboard and an HTML diagram by touch, then delivers one batch", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 850 })
  const fixture = await save(request, document)
  const coordinator = "http://127.0.0.1:4179"
  const open = await request.post(`${coordinator}/annotation-viewer`, {
    data: { documentId: fixture.stored.documentId },
  })
  expect(open.ok()).toBe(true)
  const { url } = (await open.json()) as { url: string }
  await page.goto(url)

  const picker = page.getByRole("button", { name: "Annotate", exact: true })
  await picker.focus()
  await picker.press("Enter")
  const choose = page.getByRole("combobox", { name: "Page element" })
  await choose.press("Home")
  await choose.press("ArrowDown")
  await page.getByRole("button", { name: "Comment on element" }).press("Enter")
  await addNote(page, "Lead with the conclusion.")

  await picker.click()
  const frame = page.locator("[data-annotation-frame]")
  await expect(frame.locator("iframe")).toHaveAttribute("sandbox", "allow-same-origin")
  await frame.tap()
  await addNote(page, "Give the chart a clearer title.")
  const drafts = await request.get(`${coordinator}/annotation-deliveries`)
  expect(await drafts.json()).toEqual([])
  await page.getByRole("button", { name: "Notes (2)" }).click()
  const review = page.getByRole("dialog", { name: "Annotation notes" })
  const send = review.getByRole("button", { name: "Send to Pi" })
  const copy = review.getByRole("button", { name: "Copy feedback" })
  const close = review.getByRole("button", { name: "Close" })
  await expect(send).toHaveCSS("background-color", "rgb(191, 69, 32)")
  await expect(copy).toHaveCSS("background-color", "rgb(245, 245, 245)")
  for (const button of [close, send, copy]) {
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  }
  const release = Promise.withResolvers<void>()
  await page.route(
    "**/api/annotations",
    async (route) => {
      await release.promise
      await route.fulfill({ status: 429 })
    },
    { times: 1 },
  )
  await send.focus()
  await send.press("Enter")
  try {
    const sending = review.getByRole("button", { name: "Sending…" })
    await expect(sending).toBeDisabled()
    await expect(sending).toBeFocused()
    await expect(review.getByRole("status")).toHaveText("Sending to Pi…")
  } finally {
    release.resolve()
  }
  await expect(review.getByRole("status")).toContainText("Try again shortly.")
  await expect(review.getByRole("listitem")).toHaveCount(2)
  await expect(send).toBeFocused()
  await page.route("**/api/annotations", (route) => route.fulfill({ status: 503 }), { times: 1 })
  await send.press("Enter")
  await expect(review.getByRole("status")).toHaveText(
    "Delivery could not be confirmed. Check Pi before sending again.",
  )
  await expect(review.getByRole("listitem")).toHaveCount(2)
  await expect(copy).toBeEnabled()
  await send.press("Enter")
  await expect(review.getByRole("status")).toContainText("Sent.")
  await expect(review.getByText("No notes yet.")).toBeVisible()
  await expect(send).toBeDisabled()
  await expect(copy).toBeDisabled()
  await expect(send).toHaveCSS("color", "rgb(79, 93, 117)")
  await expect(send).toHaveCSS("opacity", "1")
  await expect(close).toBeEnabled()

  const received = await request.get(`${coordinator}/annotation-deliveries`)
  const messages = (await received.json()) as string[]
  expect(messages).toHaveLength(1)
  const [source, message] = messages[0].split("\n\n")
  expect(source).toContain("Feedback submitted through the Sketchbook Viewer.")
  expect(JSON.parse(message)).toEqual({
    documentId: fixture.stored.documentId,
    notes: [
      {
        blockId: "intro",
        element: "h2",
        excerpt: "Pick this heading",
        comment: "Lead with the conclusion.",
      },
      {
        blockId: "chart",
        element: "iframe",
        excerpt: "Example chart",
        comment: "Give the chart a clearer title.",
      },
    ],
  })
  await review.getByRole("button", { name: "Close" }).click()
  await expect(page.getByRole("heading", { name: "Pick this heading", exact: true })).toBeVisible()
  await save(
    request,
    {
      ...document,
      blocks: [{ id: "intro", type: "markdown", markdown: "## The conclusion comes first" }],
    },
    fixture.stored,
  )
  await expect(page.getByRole("heading", { name: "The conclusion comes first" })).toBeVisible()
})
