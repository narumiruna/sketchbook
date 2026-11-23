import { type RefObject, useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  type Annotation,
  type AnnotationBatch,
  type AnnotationTarget,
  annotationPath,
  formatAnnotations,
  maxCommentLength,
  maxExcerptLength,
  maxNotes,
} from "../annotation.js"

const selectable = ":is(h1,h2,h3,h4,h5,h6,p,li,a,pre,th,td,img,[data-annotation-frame])"
const contentTarget = (element: Element) =>
  !element.closest(".visually-hidden") &&
  (element.matches("#sketchbook-chapter, [data-section-id] > h2, [data-annotation-frame]") ||
    Boolean(element.closest("[data-block-id]")))

function describeTarget(element: Element): AnnotationTarget {
  const frame = element.querySelector(":scope > iframe")
  const text =
    frame?.getAttribute("title") ??
    element.getAttribute("alt") ??
    // biome-ignore lint/performance/useDomNodeTextContent: The excerpt should match visible text.
    (element instanceof HTMLElement ? element.innerText : "")
  return {
    sectionId: element.closest<HTMLElement>("[data-section-id]")?.dataset.sectionId,
    blockId:
      element.closest<HTMLElement>("[data-block-id]")?.dataset.blockId ??
      frame?.getAttribute("data-block-id") ??
      undefined,
    slideId: element.matches(".deck-title")
      ? undefined
      : element.closest<HTMLElement>(".deck")?.dataset.slideId,
    element: frame ? "iframe" : element.localName,
    excerpt: text.trim().replace(/\s+/g, " ").slice(0, maxExcerptLength),
  }
}

const label = (target: AnnotationTarget) =>
  target.excerpt ? `${target.element} · ${target.excerpt}` : target.element

export function Annotations({
  content,
  documentId,
  chapterId,
  token,
  canSend,
}: {
  content: RefObject<HTMLElement | null>
  documentId: string
  chapterId: string
  token: string
  canSend: boolean
}) {
  const id = useId()
  const picker = useRef<HTMLButtonElement>(null)
  const editor = useRef<HTMLDialogElement>(null)
  const review = useRef<HTMLDialogElement>(null)
  const closeReview = useRef<HTMLButtonElement>(null)
  const choose = useRef<HTMLSelectElement>(null)
  const [targets, setTargets] = useState<Element[]>([])
  const [picking, setPicking] = useState(false)
  const [target, setTarget] = useState<AnnotationTarget>()
  const [comment, setComment] = useState("")
  const [notes, setNotes] = useState<Array<{ id: number; note: Annotation }>>([])
  const [status, setStatus] = useState("")
  const [sending, setSending] = useState(false)
  const [manualCopy, setManualCopy] = useState(false)
  const nextId = useRef(0)
  const inFlight = useRef(false)
  const batch: AnnotationBatch = {
    chapterId: chapterId === documentId ? undefined : chapterId,
    notes: notes.map(({ note }) => note),
  }
  const atLimit = notes.length >= maxNotes

  const openEditor = useCallback((element: Element) => {
    setPicking(false)
    setTarget(describeTarget(element))
    setComment("")
    picker.current?.focus({ preventScroll: true })
    editor.current?.showModal()
  }, [])

  useEffect(() => {
    if (!picking || !content.current) return
    const scope = content.current
    let highlighted: Element | undefined
    const highlight = (element?: Element) => {
      if (element === highlighted) return
      highlighted?.removeAttribute("data-annotation-hover")
      highlighted = element
      highlighted?.setAttribute("data-annotation-hover", "")
    }
    const find = (event: Event) => {
      if (!(event.target instanceof Element)) return
      const element = event.target.closest(selectable)
      if (element && scope.contains(element) && contentTarget(element)) return element
    }
    const track = (event: PointerEvent) => highlight(find(event))
    const leave = () => highlight()
    const select = (event: MouseEvent) => {
      const element = find(event)
      if (!element) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.type === "click") openEditor(element)
    }
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setPicking(false)
        picker.current?.focus({ preventScroll: true })
      }
    }
    scope.addEventListener("pointermove", track)
    scope.addEventListener("pointerleave", leave)
    scope.addEventListener("click", select, true)
    scope.addEventListener("auxclick", select, true)
    window.addEventListener("keydown", cancel)
    return () => {
      leave()
      scope.removeEventListener("pointermove", track)
      scope.removeEventListener("pointerleave", leave)
      scope.removeEventListener("click", select, true)
      scope.removeEventListener("auxclick", select, true)
      window.removeEventListener("keydown", cancel)
    }
  }, [content, openEditor, picking])

  function updateTargets() {
    setTargets(
      [...(content.current?.querySelectorAll(selectable) ?? [])].filter(
        (element) => contentTarget(element) && element.getClientRects().length,
      ),
    )
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatAnnotations(documentId, batch, token))
      setStatus("Copied. Paste the annotations into Pi.")
      setManualCopy(false)
    } catch {
      setManualCopy(true)
      setStatus("Clipboard unavailable. Copy the text below and paste it into Pi.")
    }
  }

  async function send() {
    if (!canSend || inFlight.current || !notes.length) return
    inFlight.current = true
    setSending(true)
    setStatus("Sending to Pi…")
    const sent = new Set(notes.map(({ id }) => id))
    try {
      const response = await fetch(annotationPath, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
      })
      if (response.status === 204) {
        setNotes((current) => current.filter(({ id }) => !sent.has(id)))
        setManualCopy(false)
        setStatus("Sent. Check the Pi conversation for a reply.")
        if (review.current?.open) closeReview.current?.focus()
      } else if (response.status === 429) {
        setStatus("Pi is not ready for another message. Try again shortly.")
      } else if (response.status === 503) {
        setStatus("Delivery could not be confirmed. Check Pi before sending again.")
      } else {
        setStatus("Pi did not accept the feedback. Reopen the Viewer from the Pi session.")
      }
    } catch {
      setStatus("Delivery could not be confirmed. Check Pi before sending again.")
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <div className="annotations" data-picking={picking || undefined}>
      <div className="annotation-actions">
        <button
          ref={picker}
          type="button"
          aria-pressed={picking}
          aria-describedby={picking ? `${id}-hint` : undefined}
          aria-disabled={atLimit || undefined}
          onClick={() => {
            if (atLimit) return
            if (!picking) updateTargets()
            setPicking(!picking)
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          >
            <path d="M2 2l8 6H6l-2 4L2 2zM9 2h5v4m0 4v4h-4" />
          </svg>
          Annotate
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={(event) => {
            setPicking(false)
            event.currentTarget.focus({ preventScroll: true })
            review.current?.showModal()
            closeReview.current?.focus()
          }}
        >
          Notes ({notes.length})
        </button>
      </div>
      {picking && (
        <div className="annotation-picker-help">
          <p id={`${id}-hint`}>
            Click or tap page content, or choose an element from the list. Esc cancels.
          </p>
          <div className="annotation-actions">
            <select ref={choose} aria-label="Page element" onFocus={updateTargets}>
              {targets.map((element, index) => (
                <option key={String(index)} value={index}>
                  {label(describeTarget(element))}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const element = targets[choose.current?.selectedIndex ?? -1]
                if (element && content.current?.contains(element)) openEditor(element)
              }}
            >
              Comment on element
            </button>
          </div>
        </div>
      )}
      {createPortal(
        <>
          <dialog ref={editor} className="annotation-dialog" aria-labelledby={`${id}-editor`}>
            <h1 id={`${id}-editor`}>Add annotation</h1>
            {target && <p className="annotation-target">{label(target)}</p>}
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (!target || !comment.trim() || atLimit) return
                const entry = { id: nextId.current++, note: { ...target, comment: comment.trim() } }
                setNotes((current) => [...current, entry])
                setStatus("")
                editor.current?.close()
              }}
            >
              <label htmlFor={`${id}-comment`}>Comment</label>
              <textarea
                id={`${id}-comment`}
                rows={4}
                required
                maxLength={maxCommentLength}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <div className="annotation-actions">
                <button type="button" onClick={() => editor.current?.close()}>
                  Cancel
                </button>
                <button type="submit" disabled={!comment.trim()}>
                  Add note
                </button>
              </div>
            </form>
          </dialog>
          <dialog ref={review} className="annotation-dialog" aria-labelledby={`${id}-review`}>
            <h1 id={`${id}-review`}>Annotation notes</h1>
            {notes.length ? (
              <ol className="annotation-list">
                {notes.map(({ id: noteId, note }, index) => (
                  <li key={noteId}>
                    <p className="annotation-target">{label(note)}</p>
                    <p className="annotation-comment">{note.comment}</p>
                    <button
                      type="button"
                      aria-label={`Remove note ${index + 1}`}
                      disabled={sending}
                      onClick={() => {
                        setNotes((current) => current.filter(({ id }) => id !== noteId))
                        closeReview.current?.focus()
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No notes yet.</p>
            )}
            {atLimit && <p>Send or remove notes before adding more.</p>}
            <div className="annotation-actions annotation-review-actions">
              <button type="button" ref={closeReview} onClick={() => review.current?.close()}>
                Close
              </button>
              {canSend && (
                <button
                  type="button"
                  className="annotation-primary-action"
                  disabled={!notes.length}
                  aria-disabled={sending || undefined}
                  onClick={() => void send()}
                >
                  {sending ? "Sending…" : "Send to Pi"}
                </button>
              )}
              <button
                type="button"
                className={canSend ? undefined : "annotation-primary-action"}
                disabled={!notes.length || sending}
                onClick={() => void copy()}
              >
                Copy feedback
              </button>
            </div>
            <p role="status">{status}</p>
            {manualCopy && notes.length > 0 && (
              <label>
                Feedback text
                <textarea readOnly rows={6} value={formatAnnotations(documentId, batch, token)} />
              </label>
            )}
          </dialog>
        </>,
        document.body,
      )}
    </div>
  )
}
