import { writeFile } from "node:fs/promises"
import { type APIRequestContext, expect, type Page, test } from "@playwright/test"
import type { BookEditInput } from "../../src/book.js"
import {
  chatChapters,
  chatExtraChapter,
  chatFirstSection,
  chatOverview,
  codebaseOverview,
} from "../fixtures/progressive-book.js"
import { captureArticle, type Fixture, readingMetrics, rendered, save } from "./helpers.js"

const [architecture, api, database] = chatChapters
const retry = api.sections.find(({ id }) => id === "retry")
if (!retry) throw new Error("Progressive fixture has no Retry section")

test.use({ trace: "off" })

async function editBook(
  request: APIRequestContext,
  { stored }: Fixture,
  expectedRevision: number,
  operation: BookEditInput["operation"],
) {
  const response = await request.post("http://127.0.0.1:4179/books", {
    data: { documentId: stored.documentId, expectedRevision, operation },
  })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as { revision: number; record: "document" | "book" }
}

async function publishBook(request: APIRequestContext) {
  const fixture = await save(request, chatOverview)
  let book = await editBook(request, fixture, 0, { type: "add-section", section: chatFirstSection })
  for (const chapter of chatChapters) {
    book = await editBook(request, fixture, book.revision, { type: "add-chapter", chapter })
  }
  return { fixture, book }
}

function checkLocation(href: string, fixture: Fixture, chapter?: string, section?: string) {
  const initial = new URL(fixture.url)
  const url = new URL(href, initial)
  expect(url.origin).toBe(initial.origin)
  expect(url.searchParams.get("documentId")).toBe(fixture.stored.documentId)
  expect(url.searchParams.get("chapter")).toBe(chapter ?? null)
  expect(url.searchParams.get("section")).toBe(section ?? null)
  expect(url.searchParams.has("token")).toBe(false)
  expect(url.hash === initial.hash).toBe(true)
  return url
}

function chapterURL(fixture: Fixture, chapter: string, section?: string) {
  const url = new URL(fixture.url)
  url.searchParams.set("chapter", chapter)
  if (section) url.searchParams.set("section", section)
  return url
}

const bookContents = (page: Page) => page.getByRole("navigation", { name: "Book contents" })
const chapterContents = (page: Page) => page.getByRole("list", { name: "Chapter contents" })
const chapterOrder = (page: Page) => page.getByRole("navigation", { name: "Chapter order" })
const title = (page: Page) => page.getByRole("heading", { level: 1 })

async function capture(page: Page, path: string) {
  const metrics = []
  for (const deck of await page.locator("main .deck").all()) {
    await rendered(deck)
    metrics.push(await readingMetrics(deck))
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await captureArticle(page, path)
  if (metrics.length) await writeFile(path.replace(/\.png$/, ".json"), JSON.stringify(metrics))
}

test("a quick overview still opens without book navigation", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 850 })
  await page.goto((await save(request, codebaseOverview)).url)
  await expect(title(page)).toHaveText(codebaseOverview.title)
  await expect(page.getByText("Write and read", { exact: true })).toBeVisible()
  await expect(page.getByRole("navigation")).toHaveCount(0)
  await expect(page.getByRole("complementary", { name: "Contents" })).toHaveCount(0)
  await capture(page, testInfo.outputPath("standalone.png"))
  await page.setViewportSize({ width: 390, height: 850 })
  await capture(page, testInfo.outputPath("standalone-390.png"))
})

test("the original link gains sections and promotes live without losing its introduction", async ({
  page,
  request,
}) => {
  const fixture = await save(request, chatOverview)
  await page.goto(fixture.url)
  await expect(title(page)).toHaveText(chatOverview.title)
  await expect(page.getByRole("navigation")).toHaveCount(0)
  const diagram = page.locator('[data-block-id="message-path"]')
  await rendered(diagram)

  const addedSection = await editBook(request, fixture, 0, {
    type: "add-section",
    section: chatFirstSection,
  })
  const sectionLink = page
    .getByRole("navigation", { name: "Chapter contents" })
    .getByRole("link", { name: chatFirstSection.title })
  await expect(sectionLink).toBeVisible()
  await expect(bookContents(page)).toHaveCount(0)
  await expect(chapterOrder(page)).toHaveCount(0)
  checkLocation(
    (await sectionLink.getAttribute("href")) ?? "",
    fixture,
    undefined,
    chatFirstSection.id,
  )
  await sectionLink.press("Enter")
  const section = page.getByRole("heading", { level: 2, name: chatFirstSection.title })
  await expect(section).toBeFocused()
  await expect(section).toBeInViewport()
  await page.goBack()
  await expect(title(page)).toBeFocused()
  checkLocation(page.url(), fixture)
  const scroller = diagram.locator(".static-diagram")
  await scroller.focus()
  await expect(scroller).toBeFocused()

  await editBook(request, fixture, addedSection.revision, {
    type: "add-chapter",
    chapter: architecture,
  })
  await expect(bookContents(page).getByRole("link", { name: chatOverview.title })).toHaveAttribute(
    "aria-current",
    "page",
  )
  await expect(
    chapterOrder(page).getByRole("link", { name: `Next chapter: ${architecture.title}` }),
  ).toBeVisible()
  await expect(title(page)).toHaveText(chatOverview.title)
  await expect(section).toBeVisible()
  await expect(scroller).toBeFocused()
  await expect(page.locator(".revision")).toContainText("Revision 1")
  checkLocation(page.url(), fixture)

  await save(request, { ...chatOverview, title: "How a message is saved" }, fixture.stored)
  await expect(title(page)).toHaveText("How a message is saved")
  await expect(section).toBeVisible()
  await expect(bookContents(page).getByRole("link", { name: architecture.title })).toBeVisible()
  await page.reload()
  await expect(title(page)).toHaveText("How a message is saved")
  checkLocation(page.url(), fixture)
  await rendered(diagram)
})

for (const width of [390, 1440]) {
  test(`chapters, section links, and keyboard history work at ${width}px`, async ({
    page,
    request,
    context,
  }, testInfo) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width, height: 850 })
    const { fixture } = await publishBook(request)
    const methods: string[] = []
    page.on("request", (sent) => methods.push(sent.method()))
    await page.goto(fixture.url)
    await expect(title(page)).toHaveText(chatOverview.title)
    await expect(bookContents(page).locator(".contents-chapter")).toHaveText([
      `01${chatOverview.title}`,
      `02${architecture.title}`,
      `03${api.title}`,
      `04${database.title}`,
    ])
    await expect(page.locator(".chapter-position")).toHaveText("Chapter 01 / 04")
    const sidebar = page.getByRole("complementary", { name: "Contents" })
    await expect(sidebar.getByRole("navigation")).toHaveCount(1)
    await expect(
      sidebar
        .locator("li")
        .filter({ has: page.locator('[aria-current="page"]') })
        .getByRole("list", { name: "Chapter contents" }),
    ).toBeVisible()
    const sidebarBox = await sidebar.boundingBox()
    const articleBox = await page.getByRole("main").boundingBox()
    if (!sidebarBox || !articleBox) throw new Error("Missing book layout")
    if (width === 390) {
      expect(sidebarBox.y + sidebarBox.height).toBeLessThanOrEqual(articleBox.y)
      await expect(sidebar).toHaveCSS("position", "static")
    } else {
      expect(sidebarBox.x + sidebarBox.width).toBeLessThan(articleBox.x)
      await expect(sidebar).toHaveCSS("position", "sticky")
    }
    const defaultLink = bookContents(page).getByRole("link", { name: chatOverview.title })
    checkLocation((await defaultLink.getAttribute("href")) ?? "", fixture)
    await capture(page, testInfo.outputPath("01-message.png"))
    await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: "Annotate", exact: true })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(defaultLink).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(
      chapterContents(page).getByRole("link", { name: chatFirstSection.title }),
    ).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(bookContents(page).getByRole("link", { name: architecture.title })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(bookContents(page).getByRole("link", { name: api.title })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(title(page)).toHaveText(api.title)
    await expect(title(page)).toBeFocused()
    await expect(title(page)).toBeInViewport()
    await expect(page).toHaveTitle(`${api.title} — Sketchbook`)
    checkLocation(page.url(), fixture, api.id)

    await chapterOrder(page)
      .getByRole("link", { name: `Previous chapter: ${architecture.title}` })
      .press("Enter")
    await expect(title(page)).toHaveText(architecture.title)
    await expect(title(page)).toBeFocused()
    await capture(page, testInfo.outputPath("02-architecture.png"))
    await chapterOrder(page)
      .getByRole("link", { name: `Next chapter: ${api.title}` })
      .press("Enter")
    await expect(title(page)).toHaveText(api.title)

    if (width !== 390) {
      await page.evaluate(() => window.scrollTo(0, 400))
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200)
      await expect.poll(async () => (await sidebar.boundingBox())?.y).toBeCloseTo(16, 0)
    }

    const retryLink = chapterContents(page).getByRole("link", { name: retry.title })
    const retryURL = checkLocation(
      (await retryLink.getAttribute("href")) ?? "",
      fixture,
      api.id,
      retry.id,
    )
    const retryHeading = page.getByRole("heading", { level: 2, name: retry.title, exact: true })
    const historyHeading = page.getByRole("heading", { level: 2, name: "History", exact: true })
    await retryLink.press("Enter")
    await expect(retryHeading).toBeFocused()
    await expect(retryHeading).toBeInViewport()
    await expect(retryLink).toHaveAttribute("aria-current", "location")
    checkLocation(page.url(), fixture, api.id, retry.id)
    const deck = page.locator('[data-block-id="send-retry"]')
    await rendered(deck)
    await expect(deck.getByRole("heading", { level: 3, name: "Safe send retries" })).toBeVisible()
    await deck.getByRole("button", { name: "Next slide" }).press("Enter")
    await expect(deck).toHaveAttribute("data-slide-id", "key-match")
    checkLocation(page.url(), fixture, api.id, retry.id)

    await chapterContents(page).getByRole("link", { name: "History" }).press("Enter")
    await expect(historyHeading).toBeFocused()
    await expect(historyHeading).toBeInViewport()
    await page.goBack()
    await expect(retryHeading).toBeFocused()
    await expect(retryHeading).toBeInViewport()
    await expect(deck).toHaveAttribute("data-slide-id", "key-match")
    await page.goForward()
    await expect(historyHeading).toBeFocused()
    await expect(historyHeading).toBeInViewport()
    await capture(page, testInfo.outputPath("03-api-key-match.png"))

    const fresh = await context.newPage()
    await fresh.setViewportSize({ width, height: 850 })
    await fresh.goto(retryURL.href)
    await expect(title(fresh)).toHaveText(api.title)
    const freshHeading = fresh.getByRole("heading", { level: 2, name: retry.title, exact: true })
    await expect(freshHeading).toBeFocused()
    await expect(freshHeading).toBeInViewport()
    expect(await fresh.evaluate(() => scrollY > 0)).toBe(true)
    await expect(fresh.locator('[data-block-id="send-retry"]')).toHaveAttribute(
      "data-slide-id",
      "lost-ack",
    )
    await capture(fresh, testInfo.outputPath("03-api-lost-ack.png"))
    await fresh.close()

    await chapterOrder(page)
      .getByRole("link", { name: `Next chapter: ${database.title}` })
      .press("Enter")
    await expect(title(page)).toHaveText(database.title)
    await expect(title(page)).toBeFocused()
    await expect(chapterOrder(page).getByRole("link", { name: /^Next chapter:/ })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "SQL code" })).toContainText(
      "UNIQUE (chat_id, position)",
    )
    expect(methods.every((method) => method === "GET")).toBe(true)
    await capture(page, testInfo.outputPath("04-database.png"))
  })
}

test("renaming, moving, and appending chapters keeps existing links stable", async ({
  page,
  request,
  context,
}) => {
  const { fixture, book } = await publishBook(request)
  const href = chapterURL(fixture, api.id, retry.id).href
  await page.goto(href)
  await expect(title(page)).toHaveText(api.title)
  const renamed = await editBook(request, fixture, book.revision, {
    type: "rename-chapter",
    chapterId: api.id,
    title: "Message API",
  })
  const renamedSection = await editBook(request, fixture, renamed.revision, {
    type: "rename-section",
    chapterId: api.id,
    sectionId: retry.id,
    title: "Retry a send",
  })
  const reordered = await editBook(request, fixture, renamedSection.revision, {
    type: "reorder-chapters",
    chapterIds: [api.id, architecture.id, database.id],
  })
  await editBook(request, fixture, reordered.revision, {
    type: "add-chapter",
    chapter: chatExtraChapter,
  })
  await expect(title(page)).toHaveText("Message API")
  await expect(bookContents(page).locator(".contents-chapter")).toHaveText([
    `01${chatOverview.title}`,
    "02Message API",
    `03${architecture.title}`,
    `04${database.title}`,
    `05${chatExtraChapter.title}`,
  ])
  await expect(page.locator(".chapter-position")).toHaveText("Chapter 02 / 05")
  await expect(
    chapterOrder(page).getByRole("link", { name: `Previous chapter: ${chatOverview.title}` }),
  ).toBeVisible()
  checkLocation(page.url(), fixture, api.id, retry.id)
  const fresh = await context.newPage()
  await fresh.goto(href)
  await expect(title(fresh)).toHaveText("Message API")
  await expect(fresh.getByRole("heading", { level: 2, name: "Retry a send" })).toBeFocused()
})

test("unknown targets fall back safely and chapter query fields do not authorize access", async ({
  page,
  request,
}) => {
  const { fixture, book } = await publishBook(request)
  await page.goto(chapterURL(fixture, "unknown", chatFirstSection.id).href)
  await expect(title(page)).toHaveText(chatOverview.title)
  await expect(title(page)).toBeFocused()
  await expect(page.getByText("Chapter not found. Showing the first chapter.")).toBeVisible()
  await expect(chapterContents(page).locator("[aria-current]")).toHaveCount(0)
  await page.goto(chapterURL(fixture, api.id, "absent").href)
  await expect(title(page)).toHaveText(api.title)
  await expect(title(page)).toBeFocused()
  const missingSection = page.getByText("Section not found. Showing the chapter introduction.")
  await expect(missingSection).toBeVisible()
  await editBook(request, fixture, book.revision, {
    type: "add-section",
    chapterId: api.id,
    section: { ...chatFirstSection, id: "absent" },
  })
  const publishedHeading = page.getByRole("heading", { level: 2, name: chatFirstSection.title })
  await expect(publishedHeading).toBeFocused()
  await expect(publishedHeading).toBeInViewport()
  await expect(missingSection).toHaveCount(0)

  const url = chapterURL(fixture, api.id, retry.id)
  url.hash = ""
  url.searchParams.set("token", "invalid")
  await page.goto(url.href)
  await expect(page.getByRole("status")).toContainText("link is incomplete")
  await expect(page.getByRole("main")).toHaveCount(0)
  url.searchParams.delete("token")
  url.hash = "token=invalid"
  await page.goto(url.href)
  await expect(page.getByRole("status")).toContainText("Document request failed (401)")
  await expect(page.getByRole("main")).toHaveCount(0)
})

test("a stale poll cannot roll back either revision domain", async ({ page, request }) => {
  const fixture = await save(request, chatOverview)
  const added = await editBook(request, fixture, 0, { type: "add-chapter", chapter: architecture })
  const first = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/api/documents/") && response.status() === 200,
  )
  await page.goto(fixture.url)
  const stale = await (await first).json()
  await expect(title(page)).toHaveText(chatOverview.title)
  await editBook(request, fixture, added.revision, {
    type: "rename-chapter",
    chapterId: architecture.id,
    title: "Updated architecture",
  })
  await save(request, { ...chatOverview, title: "Updated message overview" }, fixture.stored)
  await expect(title(page)).toHaveText("Updated message overview")
  const updatedLink = bookContents(page).getByRole("link", { name: "Updated architecture" })
  await expect(updatedLink).toBeVisible()

  let responseIndex = 0
  const checked = Promise.withResolvers<void>()
  await page.route("**/api/documents/**", async (route) => {
    if (++responseIndex === 1) {
      await route.fulfill({
        json: stale,
        headers: { etag: '"stale"' },
      })
    } else if (responseIndex === 2) {
      expect(route.request().headers()["if-none-match"]).toBeUndefined()
      await route.fulfill({ status: 304 })
      checked.resolve()
    } else {
      await route.continue()
    }
  })
  await checked.promise
  await expect(title(page)).toHaveText("Updated message overview")
  await expect(updatedLink).toBeVisible()
  await expect(page.locator(".revision")).toContainText("Revision 2")
  await expect(page.locator(".connection-status")).toHaveText("Connected")
})
