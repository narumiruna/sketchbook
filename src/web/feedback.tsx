import { Agentation, type AgentationProps } from "agentation"
import { useId, useRef, useState } from "react"
import { feedbackPath, removeViewerCapability, type ViewerFeedback } from "../viewer-feedback.js"

const attributes = ["data-block-id", "data-slide-id", "data-feedback-block", "data-feedback-slide"]
const blockPattern = /\[data-(?:block-id|feedback-block)="([A-Za-z0-9][A-Za-z0-9_-]{0,63})"\]/
const slidePattern = /\[data-(?:slide-id|feedback-slide)="([A-Za-z0-9][A-Za-z0-9_-]{0,63})"\]/

export default function Feedback({
  token,
  canSend,
  chapterId,
}: {
  token: string
  canSend: boolean
  chapterId?: string
}) {
  const titleId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [manualCopy, setManualCopy] = useState("")
  const [status, setStatus] = useState("")
  const [sendStatus, setSendStatus] = useState("")
  const sent = useRef(new Map<string, string>())
  const sending = useRef(false)

  const sendFeedback: NonNullable<AgentationProps["onSubmit"]> = async (_output, annotations) => {
    if (sending.current) throw new Error("Feedback is already being sent.")
    const pending = annotations.filter(
      (note) => note.comment.trim() && sent.current.get(note.id) !== note.comment,
    )
    if (!pending.length) {
      setSendStatus("No new notes to send to Pi.")
      throw new Error("No new feedback notes.")
    }
    sending.current = true
    setSendStatus("Sending to Pi…")
    let failure = "Could not reach Pi. Copy your feedback or try again."
    try {
      const feedback: ViewerFeedback = {
        chapterId,
        notes: pending.map((note) => ({
          comment: removeViewerCapability(note.comment, token, location.origin),
          blockId: blockPattern.exec(note.elementPath)?.[1],
          slideId: slidePattern.exec(note.elementPath)?.[1],
        })),
      }
      const response = await fetch(feedbackPath, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify(feedback),
      })
      if (response.status !== 204) {
        if (response.status === 429)
          failure = "Pi is not ready for another message. Try again shortly."
        if (response.status === 400 || response.status === 413) {
          failure = "Send 1–10 notes, each with at most 2,000 characters."
        }
        throw new Error("Pi did not accept feedback.")
      }
      for (const note of pending) sent.current.set(note.id, note.comment)
      setSendStatus("Sent to Pi. Check the current Pi conversation for the reply.")
    } catch {
      setSendStatus(failure)
      throw new Error(failure)
    } finally {
      sending.current = false
    }
  }

  async function copyFeedback(output: string) {
    const text = removeViewerCapability(output, token, location.origin)
    setStatus("")
    try {
      await navigator.clipboard.writeText(text)
      setStatus("Feedback copied. Paste it into Pi to share it.")
    } catch {
      setManualCopy(text)
      dialog.current?.showModal()
    }
  }

  return (
    <>
      <Agentation
        appName="Sketchbook"
        copyToClipboard={false}
        enableKeyboardShortcuts={false}
        identifyingAttributes={attributes}
        onCopy={(output) => void copyFeedback(output)}
        onSubmit={canSend ? sendFeedback : undefined}
      />
      {canSend && (
        <span className="feedback-status" data-feedback-toolbar="" role="status">
          {sendStatus}
        </span>
      )}
      <span className="visually-hidden" role="status">
        {status}
      </span>
      <dialog
        className="feedback-copy"
        data-feedback-toolbar=""
        aria-labelledby={titleId}
        ref={dialog}
        onClose={() => setManualCopy("")}
      >
        <h2 id={titleId}>Copy feedback manually</h2>
        <p>Clipboard access is unavailable. Copy the text below and paste it into Pi.</p>
        <textarea aria-label="Feedback text" value={manualCopy} rows={8} readOnly autoFocus />
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </dialog>
    </>
  )
}
