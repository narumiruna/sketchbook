import { useEffect, useId, useRef, useState } from "react"
import type { Chapter, StoredBook } from "../book.js"
import type { CodeBlock, DiagramDeck, StoredDocument } from "../document.js"
import { BookContents, ChapterOrder, chapterNumber, useBookLocation } from "./chapter-navigation"
import { Diagram } from "./diagram"
import { Markdown } from "./markdown"

interface Session {
  documentId: string
  token: string
}

type ViewerDocument = StoredDocument & { book?: StoredBook }

function mergeDocument(current: ViewerDocument | null, next: ViewerDocument): ViewerDocument {
  if (!current) return next
  const document = next.revision > current.revision ? next : current
  const book = (next.book?.revision ?? 0) > (current.book?.revision ?? 0) ? next.book : current.book
  return document.book === book ? document : { ...document, book }
}

function useDocument({ documentId, token }: Session) {
  const [stored, setStored] = useState<ViewerDocument | null>(null)
  const [status, setStatus] = useState("Loading document…")

  useEffect(() => {
    if (!documentId || !token) {
      setStatus("This viewer link is incomplete. Open the document again from Pi.")
      return
    }
    let stopped = false
    let current: ViewerDocument | null = null
    let etag = ""
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending = false
    const controller = new AbortController()
    const visible = () => document.visibilityState !== "hidden"
    const poll = async () => {
      if (stopped || pending || !visible()) return
      pending = true
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(etag ? { "If-None-Match": etag } : {}),
          },
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        })
        if (stopped) return
        if (response.status !== 304) {
          if (!response.ok) throw new Error(`Document request failed (${response.status})`)
          const next = (await response.json()) as ViewerDocument
          if (stopped) return
          if (
            next?.documentId !== documentId ||
            !Number.isSafeInteger(next.revision) ||
            next.revision < 1 ||
            !Array.isArray(next.document?.blocks) ||
            (next.book !== undefined &&
              (next.book?.documentId !== documentId ||
                !Number.isSafeInteger(next.book.revision) ||
                next.book.revision < 1 ||
                !Array.isArray(next.book.sections) ||
                !Array.isArray(next.book.chapters)))
          ) {
            throw new Error("Invalid document response")
          }
          current = mergeDocument(current, next)
          setStored(current)
          etag =
            current.revision === next.revision && current.book?.revision === next.book?.revision
              ? (response.headers.get("ETag") ?? "")
              : ""
        }
        setStatus("Connected")
      } catch (error) {
        if (!stopped) {
          setStatus(
            `Connection lost. Last loaded content is kept. ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      } finally {
        pending = false
        if (!stopped && visible()) timer = setTimeout(poll, 1000)
      }
    }
    const visibility = () => {
      clearTimeout(timer)
      if (visible()) void poll()
    }
    document.addEventListener("visibilitychange", visibility)
    void poll()
    return () => {
      stopped = true
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [documentId, token])
  return { stored, status }
}

interface Selection {
  id: string
  ids: string[]
}

function currentSlide(deck: DiagramDeck, selection: Selection) {
  const selected = deck.slides.find((slide) => slide.id === selection.id)
  if (selected) return selected
  const oldIndex = Math.max(0, selection.ids.indexOf(selection.id))
  for (let distance = 1; distance < selection.ids.length; distance++) {
    for (const index of [oldIndex + distance, oldIndex - distance]) {
      const neighbor = deck.slides.find((slide) => slide.id === selection.ids[index])
      if (neighbor) return neighbor
    }
  }
  return deck.slides[Math.min(oldIndex, deck.slides.length - 1)]
}

function Deck({ deck, inSection }: { deck: DiagramDeck; inSection: boolean }) {
  const DeckTitle = inSection ? "h3" : "h2"
  const SlideTitle = inSection ? "h4" : "h3"
  const titleId = useId()
  const viewportId = useId()
  const [selection, setSelection] = useState<Selection>(() => ({
    id: deck.slides[0].id,
    ids: deck.slides.map((slide) => slide.id),
  }))
  const active = currentSlide(deck, selection)
  const isSvg = "svg" in active
  const index = deck.slides.indexOf(active)
  const ids = deck.slides.map((slide) => slide.id)
  const multiple = deck.slides.length > 1
  useEffect(() => {
    setSelection((previous) => {
      const selected = currentSlide(deck, previous)
      return { id: selected.id, ids: deck.slides.map((slide) => slide.id) }
    })
  }, [deck])

  const select = (id: string) => setSelection({ id, ids })
  const move = (offset: number) => {
    const slide = deck.slides[index + offset]
    if (slide) select(slide.id)
  }
  return (
    <section
      className="deck"
      data-block-id={deck.id}
      data-slide-id={active.id}
      aria-labelledby={titleId}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus enables the required deck-local arrow controls.
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault()
          move(event.key === "ArrowLeft" ? -1 : 1)
        }
      }}
    >
      <header className="deck-heading">
        <div>
          <DeckTitle id={titleId} className="deck-title">
            {deck.title}
          </DeckTitle>
          <SlideTitle className={deck.title === active.title ? "visually-hidden" : "slide-title"}>
            {active.title}
          </SlideTitle>
        </div>
        <span className="deck-kind">{isSvg ? "SVG" : "Mermaid"}</span>
      </header>
      <div className="slide-content">
        <div className="slide-figure">
          <div className="deck-viewport" id={viewportId}>
            <Diagram
              source={isSvg ? active.svg : active.mermaid}
              format={isSvg ? "svg" : "mermaid"}
              title={active.title}
              blockId={deck.id}
              slideId={active.id}
              focusNodes={isSvg ? undefined : active.focusNodes}
            />
          </div>
          {multiple && (
            <fieldset className="slide-pagination" aria-label={`${deck.title} slide positions`}>
              <button
                type="button"
                className="deck-arrow deck-arrow-previous"
                aria-label="Previous slide"
                aria-controls={viewportId}
                title="Previous slide (←)"
                disabled={index === 0}
                onClick={() => move(-1)}
              >
                <span className="deck-arrow-icon" aria-hidden="true" />
                <span>Previous</span>
              </button>
              <div className="slide-dots">
                {deck.slides.map((slide, position) => (
                  <button
                    key={slide.id}
                    type="button"
                    className="slide-dot"
                    data-slide-id={slide.id}
                    aria-label={`Slide ${position + 1}: ${slide.title}`}
                    aria-controls={viewportId}
                    aria-current={slide.id === active.id ? "step" : undefined}
                    title={`Slide ${position + 1}: ${slide.title}`}
                    onClick={() => select(slide.id)}
                  >
                    <span aria-hidden="true" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="deck-arrow deck-arrow-next"
                aria-label="Next slide"
                aria-controls={viewportId}
                title="Next slide (→)"
                disabled={index === deck.slides.length - 1}
                onClick={() => move(1)}
              >
                <span>Next</span>
                <span className="deck-arrow-icon" aria-hidden="true" />
              </button>
              <span className="slide-count" aria-live="polite">
                {index + 1} / {deck.slides.length}
              </span>
            </fieldset>
          )}
        </div>
        <div className="slide-explanation">
          <Markdown
            markdown={active.explanationMarkdown}
            context={`Block ${deck.id}, slide ${active.id}`}
            headingLevel={inSection ? 5 : 4}
          />
        </div>
      </div>
    </section>
  )
}

function CodeSnippet({ block }: { block: CodeBlock }) {
  return (
    <figure className="code-block" data-block-id={block.id}>
      {block.language && <figcaption>{block.language}</figcaption>}
      {/* biome-ignore lint/a11y/useSemanticElements: Preserve preformatted code in a named scroll region. */}
      <pre
        role="region"
        aria-label={block.language ? `${block.language} code` : "Code block"}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus enables native keyboard scrolling.
        tabIndex={0}
      >
        <code>{block.code}</code>
      </pre>
    </figure>
  )
}

function Blocks({ blocks, inSection = false }: { blocks: Chapter["blocks"]; inSection?: boolean }) {
  return blocks.map((block) => {
    switch (block.type) {
      case "markdown":
        return (
          <section key={block.id} data-block-id={block.id} aria-label={`Text block ${block.id}`}>
            <Markdown
              markdown={block.markdown}
              context={`Block ${block.id}`}
              headingLevel={inSection ? 3 : undefined}
            />
          </section>
        )
      case "code":
        return <CodeSnippet key={block.id} block={block} />
      default:
        return <Deck key={block.id} deck={block} inSection={inSection} />
    }
  })
}

const sectionHeadingId = (sectionId: string) => `sketchbook-section-${sectionId}`
const chapterHeadingId = "sketchbook-chapter"

function Reader({ stored, token }: { stored: ViewerDocument; token: string }) {
  const { documentId, revision, updatedAt, document: original, book } = stored
  const first: Chapter = {
    id: documentId,
    title: original.title,
    blocks: original.blocks,
    sections: book?.sections ?? [],
  }
  const chapters = [first, ...(book?.chapters ?? [])]
  const { location, links } = useBookLocation(documentId, token)
  const query = new URLSearchParams(location.search)
  const chapterId = query.get("chapter")
  const sectionId = query.get("section")
  const requested = chapters.find((chapter) => chapter.id === (chapterId ?? documentId))
  const chapter = requested ?? first
  const section = requested?.sections.find((section) => section.id === sectionId)
  const index = chapters.indexOf(chapter)
  const notice = !requested
    ? "Chapter not found. Showing the first chapter."
    : sectionId !== null && !section
      ? "Section not found. Showing the chapter introduction."
      : null
  const lastFocus = useRef<{ location: typeof location; target: string } | null>(null)
  const focusId = section ? sectionHeadingId(section.id) : chapterHeadingId
  const focusTarget = `${chapter.id}/${focusId}`
  const shouldFocus = location.focus || chapterId !== null || sectionId !== null
  useEffect(() => {
    if (
      !shouldFocus ||
      (lastFocus.current?.location === location && lastFocus.current.target === focusTarget)
    )
      return
    lastFocus.current = { location, target: focusTarget }
    const heading = document.getElementById(focusId)
    heading?.scrollIntoView({ block: "start" })
    heading?.focus({ preventScroll: true })
  }, [location, focusId, focusTarget, shouldFocus])
  useEffect(() => {
    document.title = `${chapter.title} — Pi Sketchbook`
  }, [chapter.title])

  const revisionRecord = index > 0 && book ? book : { revision, updatedAt }
  const hasContents = chapters.length > 1 || chapter.sections.length > 0
  return (
    <div className={hasContents ? "book-layout" : undefined}>
      {hasContents && (
        <BookContents chapters={chapters} chapter={chapter} section={section} links={links} />
      )}
      <main>
        <header className={chapters.length > 1 ? "book-chapter-header" : undefined}>
          {chapters.length > 1 && (
            <p className="chapter-position">
              Chapter {chapterNumber(index)} / {chapterNumber(chapters.length - 1)}
            </p>
          )}
          <h1 id={chapterHeadingId} tabIndex={-1}>
            {chapter.title}
          </h1>
          <p className="revision">
            {index > 0 ? "Book revision" : "Revision"} {revisionRecord.revision} ·{" "}
            <time dateTime={revisionRecord.updatedAt}>
              {new Date(revisionRecord.updatedAt).toLocaleString()}
            </time>
          </p>
        </header>
        {notice && <p role="status">{notice}</p>}
        <Blocks key={chapter.id} blocks={chapter.blocks} />
        {chapter.sections.map(({ id, title, blocks }) => (
          <section key={`${chapter.id}/${id}`} className="chapter-section">
            <h2 id={sectionHeadingId(id)} tabIndex={-1}>
              {title}
            </h2>
            <Blocks blocks={blocks} inSection />
          </section>
        ))}
        <ChapterOrder previous={chapters[index - 1]} next={chapters[index + 1]} links={links} />
      </main>
    </div>
  )
}

export function App({ session }: { session: Session }) {
  const { stored, status } = useDocument(session)
  return (
    <div className="viewer">
      <header className="viewer-header">
        <span className="brand">Pi Sketchbook</span>
        <p role="status" className="connection-status">
          {status}
        </p>
      </header>
      {stored && <Reader stored={stored} token={session.token} />}
    </div>
  )
}
