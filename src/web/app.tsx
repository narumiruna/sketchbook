import { useEffect, useId, useState } from "react"
import type { DiagramDeck, StoredDocument } from "../document.js"
import { Diagram } from "./diagram"
import { Markdown } from "./markdown"

interface Session {
  documentId: string
  token: string
}

function useDocument({ documentId, token }: Session) {
  const [stored, setStored] = useState<StoredDocument | null>(null)
  const [status, setStatus] = useState("Loading document…")

  useEffect(() => {
    if (!documentId || !token) {
      setStatus("This viewer link is incomplete. Open the document again from Pi.")
      return
    }
    let stopped = false
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
        if (response.status === 304) {
          setStatus("Connected")
        } else {
          if (!response.ok) throw new Error(`Document request failed (${response.status})`)
          const next = (await response.json()) as StoredDocument
          if (
            next.documentId !== documentId ||
            !Number.isInteger(next.revision) ||
            !next.document
          ) {
            throw new Error("Invalid document response")
          }
          if (!stopped) {
            setStored((previous) =>
              !previous || next.revision > previous.revision ? next : previous,
            )
            etag = response.headers.get("ETag") ?? ""
            setStatus("Connected")
          }
        }
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
  // Prefer the next old neighbor, then the previous one at the same distance.
  for (let distance = 1; distance < selection.ids.length; distance++) {
    for (const index of [oldIndex + distance, oldIndex - distance]) {
      const neighbor = deck.slides.find((slide) => slide.id === selection.ids[index])
      if (neighbor) return neighbor
    }
  }
  return deck.slides[Math.min(oldIndex, deck.slides.length - 1)]
}

function Deck({ deck }: { deck: DiagramDeck }) {
  const titleId = useId()
  const viewportId = useId()
  const [selection, setSelection] = useState<Selection>(() => ({
    id: deck.slides[0].id,
    ids: deck.slides.map((slide) => slide.id),
  }))
  const active = currentSlide(deck, selection)
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
          <h2 id={titleId}>{deck.title}</h2>
          <h3 className={deck.title === active.title ? "visually-hidden" : undefined}>
            {active.title}
          </h3>
        </div>
        <span className="deck-kind">Mermaid</span>
      </header>
      <div className="slide-content">
        <div className="slide-figure">
          <div className="deck-viewport" id={viewportId}>
            <Diagram source={active.mermaid} blockId={deck.id} slideId={active.id} />
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
            scope="explanation"
          />
        </div>
      </div>
    </section>
  )
}

export function App({ session }: { session: Session }) {
  const { stored, status } = useDocument(session)
  useEffect(() => {
    document.title = stored ? `${stored.document.title} — Pi Sketchbook` : "Pi Sketchbook"
  }, [stored])
  return (
    <div className="viewer">
      <header className="viewer-header">
        <span className="brand">Pi Sketchbook</span>
        <p role="status" className="connection-status">
          {status}
        </p>
      </header>
      {stored && (
        <main>
          <h1>{stored.document.title}</h1>
          <p className="revision">
            Revision {stored.revision} ·{" "}
            <time dateTime={stored.updatedAt}>{new Date(stored.updatedAt).toLocaleString()}</time>
          </p>
          {stored.document.blocks.map((block) =>
            block.type === "markdown" ? (
              <section
                key={block.id}
                data-block-id={block.id}
                aria-label={`Text block ${block.id}`}
              >
                <Markdown markdown={block.markdown} context={`Block ${block.id}`} />
              </section>
            ) : (
              <Deck key={block.id} deck={block} />
            ),
          )}
        </main>
      )}
    </div>
  )
}
