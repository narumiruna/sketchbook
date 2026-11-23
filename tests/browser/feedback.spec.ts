import { expect, type Page, test } from "@playwright/test"
import type { SketchbookDocument } from "../../src/document.js"
import { drawing } from "../fixtures/static-drawing.js"
import { save } from "./helpers.js"

const document: SketchbookDocument = {
  schemaVersion: 1,
  title: "Feedback fixture",
  blocks: [{ type: "markdown", id: "intro", markdown: "Pick this paragraph." }],
}

const copy = (page: Page) => page.getByRole("button", { name: "Copy feedback", exact: true })

async function annotate(page: Page, note: string) {
  await page.getByRole("button", { name: "Annotate", exact: true }).click()
  await page.getByRole("button", { name: "Start feedback mode" }).click()
  await page.getByText("Pick this paragraph.", { exact: true }).click()
  await page.getByPlaceholder("What should change?", { exact: true }).fill(note)
  await page.getByRole("button", { name: "Add", exact: true }).click()
}

test("Agentation copies feedback without sending it or exposing the Viewer capability", async ({
  context,
  page,
  request,
}) => {
  const fixture = await save(request, document)
  const url = new URL(fixture.url)
  url.hostname = "127.0.0.1"
  url.pathname = "/"
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url.origin })
  await page.addInitScript(() => {
    localStorage.setItem("feedback-toolbar-settings", JSON.stringify({ outputDetail: "forensic" }))
  })
  const unexpected: string[] = []
  page.on("request", (request) => {
    const target = new URL(request.url())
    if (target.protocol !== "http:" && target.protocol !== "https:") return
    if (target.origin !== url.origin) unexpected.push("cross-origin")
    if (request.method() !== "GET") unexpected.push(request.method())
  })
  await page.goto(url.href)
  await expect(page.getByRole("button", { name: "Start feedback mode" })).toHaveCount(0)
  await annotate(page, "Please shorten this paragraph.")
  await expect(page.getByRole("button", { name: "Send Annotations" })).toHaveCount(0)
  await copy(page).click()
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const text = await navigator.clipboard.readText()
        const token = new URLSearchParams(location.hash.slice(1)).get("token") ?? ""
        return {
          note: text.includes("Please shorten this paragraph."),
          document: location.pathname.startsWith("/view-") && text.includes(location.pathname),
          forensic: text.includes("**Environment:**"),
          private: !token || text.includes(token) || text.includes(location.origin),
          storedToken: !token || JSON.stringify(localStorage).includes(token),
        }
      })
    })
    .toEqual({ note: true, document: true, forensic: true, private: false, storedToken: false })
  expect(unexpected).toEqual([])
})

test("drafts are chapter-local, and blocked clipboard access offers manual copy", async ({
  page,
  request,
}) => {
  const fixture = await save(request, document)
  const response = await request.post("http://127.0.0.1:4179/books", {
    data: {
      documentId: fixture.stored.documentId,
      expectedRevision: 0,
      operation: {
        type: "add-chapter",
        chapter: { id: "extra", title: "Extra chapter", blocks: document.blocks, sections: [] },
      },
    },
  })
  expect(response.ok()).toBe(true)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined })
  })
  await page.goto(fixture.url)
  await annotate(page, "Feedback for the original page only.")
  await copy(page).click()
  const dialog = page.getByRole("dialog", { name: "Copy feedback manually" })
  await expect(dialog.getByRole("textbox", { name: "Feedback text" })).toHaveValue(
    /Feedback for the original page only\./,
  )
  await dialog.getByRole("button", { name: "Close" }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole("button", { name: "Exit", exact: true }).click()
  const contents = page.getByRole("navigation", { name: "Book contents" })
  await contents.getByRole("link", { name: "Extra chapter" }).click()
  await expect(page.getByRole("heading", { name: "Extra chapter", level: 1 })).toBeVisible()
  await page.getByRole("button", { name: "Start feedback mode" }).click()
  await expect(copy(page)).toBeDisabled()
  await page.getByRole("button", { name: "Exit", exact: true }).click()
  await page.goBack()
  await expect(page.getByRole("heading", { name: document.title, level: 1 })).toBeVisible()
  await page.getByRole("button", { name: "Start feedback mode" }).click()
  await expect(copy(page)).toBeEnabled()

  const other = await save(request, { ...document, title: "Another document" })
  await page.goto(other.url)
  await page.getByRole("button", { name: "Annotate", exact: true }).click()
  await page.getByRole("button", { name: "Start feedback mode" }).click()
  await expect(copy(page)).toBeDisabled()
})

test("an interactive Viewer sends chapter feedback to Pi and keeps failed drafts", async ({
  page,
  request,
}) => {
  const fixture = await save(request, document)
  const coordinator = "http://127.0.0.1:4179"
  const book = await request.post(`${coordinator}/books`, {
    data: {
      documentId: fixture.stored.documentId,
      expectedRevision: 0,
      operation: {
        type: "add-chapter",
        chapter: {
          id: "extra",
          title: "Extra chapter",
          blocks: [
            ...document.blocks,
            {
              id: "deck",
              title: "Example deck",
              type: "diagram-deck",
              slides: [
                {
                  id: "overview",
                  title: "Example slide",
                  explanationMarkdown: "Example slide explanation.",
                  svg: drawing("Diagram for feedback"),
                },
              ],
            },
          ],
          sections: [],
        },
      },
    },
  })
  expect(book.ok()).toBe(true)
  const interaction = await request.post(`${coordinator}/interaction`, {
    data: { documentId: fixture.stored.documentId },
  })
  expect(interaction.ok()).toBe(true)
  const { url } = (await interaction.json()) as { url: string }
  const received = async () => (await request.get(`${coordinator}/messages`)).json()
  await page.goto(url)
  await page.getByRole("link", { name: "Extra chapter", exact: true }).click()
  await annotate(page, "Try a shorter introduction.")
  await page.getByRole("img", { name: "Example slide" }).click()
  await page.getByPlaceholder("What should change?", { exact: true }).fill("Label the arrow.")
  await page.getByRole("button", { name: "Add", exact: true }).click()
  const send = page.getByRole("button", { name: "Send Annotations" })
  const release = Promise.withResolvers<void>()
  const issued = Promise.withResolvers<void>()
  let submissions = 0
  await page.route("**/api/feedback", async (route) => {
    submissions++
    if (submissions === 1) {
      issued.resolve()
      await release.promise
      await route.fulfill({ status: 503 })
      return
    }
    await route.continue()
  })
  await send.click()
  await issued.promise
  try {
    await expect(send).toBeDisabled()
    await send.evaluate((button: HTMLButtonElement) => button.click())
  } finally {
    release.resolve()
  }
  await expect(page.getByText("Could not reach Pi. Copy your feedback or try again.")).toBeVisible()
  expect(submissions).toBe(1)
  expect(await received()).toHaveLength(0)
  await expect(copy(page)).toBeEnabled()

  await send.click()
  await expect(
    page.getByText("Sent to Pi. Check the current Pi conversation for the reply."),
  ).toBeVisible()
  const messages = (await received()) as [string, unknown][]
  expect(messages).toHaveLength(1)
  const [message, options] = messages[0]
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get("token") ?? ""
  expect(!token || message.includes(token)).toBe(false)
  expect(JSON.parse(message.slice(message.indexOf("\n") + 1))).toEqual({
    documentId: fixture.stored.documentId,
    chapterId: "extra",
    notes: [
      { comment: "Try a shorter introduction.", blockId: "intro" },
      { comment: "Label the arrow.", blockId: "deck", slideId: "overview" },
    ],
  })
  expect(options).toEqual({ deliverAs: "followUp", expandPromptTemplates: false })
  await send.click()
  await expect(page.getByText("No new notes to send to Pi.")).toBeVisible()
  expect(submissions).toBe(2)
})
