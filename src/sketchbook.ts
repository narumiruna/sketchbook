import { resolve } from "node:path"
import { type Static, Type } from "typebox"
import { BookEditInputSchema, StoredBookSchema, validateBookEditInput } from "./book.js"
import {
  assertSchema,
  DocumentIdSchema,
  StoredDocumentSchema,
  WriteInputSchema,
} from "./document.js"
import type { FileMutationQueue } from "./mutation-queue.js"
import { ViewerServer } from "./server.js"
import { DocumentStore, STORAGE_DIR } from "./store.js"

const IdInputSchema = Type.Object({ documentId: DocumentIdSchema }, { additionalProperties: false })
export const PiOpenInputSchema = Type.Object(
  {
    ...IdInputSchema.properties,
    sendFeedback: Type.Optional(
      Type.Boolean({ description: "Enable Send to Pi on a private, same-device Viewer link." }),
    ),
  },
  { additionalProperties: false },
)
export type ReadInput = Static<typeof IdInputSchema>
export type OpenInput = Static<typeof PiOpenInputSchema>

const ErrorSchema = Type.Object({ ok: Type.Literal(false), error: Type.String() })
const blockSchema = Type.Object({
  id: Type.String(),
  type: Type.String(),
  slides: Type.Optional(Type.Integer()),
})
const WriteOutputSchema = Type.Union([
  Type.Object({
    ok: Type.Literal(true),
    documentId: DocumentIdSchema,
    revision: Type.Integer(),
    path: Type.String(),
    blocks: Type.Array(blockSchema),
    renderingVerified: Type.Literal(false),
  }),
  ErrorSchema,
])
const ReadOutputSchema = Type.Union([
  Type.Object({
    ok: Type.Literal(true),
    stored: StoredDocumentSchema,
    path: Type.String(),
    contentTruncated: Type.Boolean(),
  }),
  ErrorSchema,
])
const ReadBookOutputSchema = Type.Union([
  Type.Object({
    ok: Type.Literal(true),
    book: Type.Union([StoredBookSchema, Type.Null()]),
    contentTruncated: Type.Boolean(),
  }),
  ErrorSchema,
])
const EditOutputSchema = Type.Union([
  Type.Object({
    ok: Type.Literal(true),
    documentId: DocumentIdSchema,
    revision: Type.Integer(),
    record: Type.Union([Type.Literal("document"), Type.Literal("book")]),
    renderingVerified: Type.Literal(false),
  }),
  ErrorSchema,
])
const OpenOutputSchema = Type.Union([
  Type.Object({
    ok: Type.Literal(true),
    documentId: DocumentIdSchema,
    url: Type.String(),
    renderingVerified: Type.Literal(false),
  }),
  ErrorSchema,
])

type Failure = Static<typeof ErrorSchema>

function result<T extends object>(data: T, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: data,
    structuredContent: data,
  }
}

export function failed(error: unknown) {
  const message = (error instanceof Error ? error.message : "Sketchbook operation failed.").slice(
    0,
    2000,
  )
  const data: Failure = { ok: false, error: message }
  return { ...result(data, message), isError: true }
}

function sourceContent(
  source: string,
  path: string,
  field = "stored",
): { text: string; truncated: boolean } {
  const lines = source.split("\n")
  const head = lines.slice(0, 1900).join("\n")
  const bytes = Buffer.from(head)
  const truncated = lines.length > 1900 || bytes.length > 48_000
  const text =
    bytes.length > 48_000
      ? new TextDecoder().decode(bytes.subarray(0, 48_000), { stream: true })
      : head
  return {
    text: truncated
      ? `${text}\n[Content truncated at 48,000 bytes or 1,900 lines. Full ${field === "book" ? "book" : "document"}: ${path}. Full data remains in structuredContent.${field}.]`
      : text,
    truncated,
  }
}

interface Workspace {
  store: DocumentStore
  viewer?: ViewerServer
  feedbackViewers: Map<string, ViewerServer>
}

/** Allocate workspace resources only when a tool executes. */
export function createSketchbookTools(mutationQueue?: FileMutationQueue) {
  const workspaces = new Map<string, Workspace>()
  const lifetime = new AbortController()
  let closing: Promise<void> | undefined

  function workspace(cwd: string): Workspace {
    lifetime.signal.throwIfAborted()
    const key = resolve(cwd)
    let state = workspaces.get(key)
    if (!state) {
      state = { store: new DocumentStore(key, mutationQueue), feedbackViewers: new Map() }
      workspaces.set(key, state)
    }
    return state
  }

  function signalFor(signal?: AbortSignal): AbortSignal {
    return signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal
  }

  const write = {
    name: "sketchbook_write" as const,
    label: "Sketchbook Write",
    promptSnippet: "Create or replace a saved Pi Sketchbook document with revision checks",
    description: `Create or fully replace a Pi Sketchbook document with Markdown, code, static Diagram Design HTML blocks, or static SVG decks. Use \`diagram-html\` for complete Diagram Design output, not raw HTML in Markdown. Updates require documentId and expectedRevision; read after a conflict. Writes only ${STORAGE_DIR}/*.json, same-directory temporary files, and ${STORAGE_DIR}/.gitignore in the workspace; never changes the workspace root .gitignore. Saving does not verify browser rendering.`,
    parameters: WriteInputSchema,
    outputSchema: WriteOutputSchema,
    async execute(input: unknown, cwd: string, signal?: AbortSignal) {
      try {
        const active = signalFor(signal)
        active.throwIfAborted()
        const { stored, path } = await workspace(cwd).store.write(input, active)
        const data: Static<typeof WriteOutputSchema> = {
          ok: true,
          documentId: stored.documentId,
          revision: stored.revision,
          path,
          blocks: stored.document.blocks.map((block) => ({
            id: block.id,
            type: block.type,
            ...(block.type === "diagram-deck" ? { slides: block.slides.length } : {}),
          })),
          renderingVerified: false,
        }
        return result(
          data,
          `Saved ${stored.documentId}, revision ${stored.revision}, at ${path}. Browser rendering is not verified.`,
        )
      } catch (error) {
        return failed(error)
      }
    },
  }

  const read = {
    name: "sketchbook_read" as const,
    label: "Sketchbook Read",
    promptSnippet: "Read a saved Pi Sketchbook document and its current revision",
    description:
      "Read a saved Pi Sketchbook document and its revision before editing. Text output is limited to 48,000 bytes or 1,900 lines; the full document remains in structuredContent.stored and at the reported JSON path.",
    parameters: IdInputSchema,
    outputSchema: ReadOutputSchema,
    async execute(input: unknown, cwd: string, signal?: AbortSignal) {
      try {
        const active = signalFor(signal)
        active.throwIfAborted()
        assertSchema(IdInputSchema, input)
        const stored = await workspace(cwd).store.read(input.documentId, active)
        active.throwIfAborted()
        const path = resolve(cwd, STORAGE_DIR, `${stored.documentId}.json`)
        const content = sourceContent(JSON.stringify(stored, null, 2), path)
        const data: Static<typeof ReadOutputSchema> = {
          ok: true,
          stored,
          path,
          contentTruncated: content.truncated,
        }
        return result(data, content.text)
      } catch (error) {
        return failed(error)
      }
    },
  }

  const readBook = {
    name: "sketchbook_read_book" as const,
    label: "Sketchbook Read Book",
    promptSnippet: "Read a page’s sections, additional chapters, and their shared revision",
    description:
      "Read the sections and additional chapters attached to an existing Sketchbook page. Null book means no structured content and expected revision 0. The original page’s intro and title are returned by sketchbook_read, not this tool. Full book data is in structuredContent.book even if the text preview is truncated.",
    parameters: IdInputSchema,
    outputSchema: ReadBookOutputSchema,
    async execute(input: unknown, cwd: string, signal?: AbortSignal) {
      try {
        const active = signalFor(signal)
        active.throwIfAborted()
        assertSchema(IdInputSchema, input)
        const book = (await workspace(cwd).store.readBook(input.documentId, active)) ?? null
        active.throwIfAborted()
        const path = resolve(cwd, STORAGE_DIR, `${input.documentId}.book.json`)
        const content = sourceContent(JSON.stringify(book, null, 2), path, "book")
        const data: Static<typeof ReadBookOutputSchema> = {
          ok: true,
          book,
          contentTruncated: content.truncated,
        }
        return result(data, content.text)
      } catch (error) {
        return failed(error)
      }
    },
  }

  const edit = {
    name: "sketchbook_edit" as const,
    label: "Sketchbook Edit",
    promptSnippet:
      "Add or edit one Sketchbook chapter, section, block, or slide with a revision check",
    description:
      "Make one revision-checked change without resending unrelated content. Omit chapterId to target the original page. Block and slide edits with neither chapterId nor sectionId use the original document revision from sketchbook_read; all other operations use the book revision from sketchbook_read_book (0 if null). Adding a chapter puts the original page first; adding a section does not require a book. Use append for new content and replace-block only for a deliberate replacement. On conflict or uncertain result, read the changed record before retrying. Saving does not verify browser rendering.",
    parameters: BookEditInputSchema,
    outputSchema: EditOutputSchema,
    async execute(input: unknown, cwd: string, signal?: AbortSignal) {
      try {
        const active = signalFor(signal)
        active.throwIfAborted()
        const edit = validateBookEditInput(input)
        const mutation = await workspace(cwd).store.editBook(edit, active)
        const data: Static<typeof EditOutputSchema> = {
          ok: true,
          documentId: edit.documentId,
          ...mutation,
          renderingVerified: false,
        }
        return result(
          data,
          `Updated ${data.record} for ${data.documentId}, revision ${data.revision}. Browser rendering is not verified.`,
        )
      } catch (error) {
        return failed(error)
      }
    },
  }

  const open = {
    name: "sketchbook_open" as const,
    label: "Sketchbook Open",
    promptSnippet: "Get a read-only Pi Sketchbook viewer URL for the current session",
    description:
      "Return a read-only viewer URL for a saved document; does not launch a browser or verify rendering. Listens on all IPv4 interfaces and automatically uses a private LAN address, or loopback if none is detected. Use only on trusted networks and keep the full capability URL private. The URL expires when the hosting session or server stops; open again after restarting.",
    parameters: IdInputSchema,
    outputSchema: OpenOutputSchema,
    async execute(
      input: unknown,
      cwd: string,
      signal?: AbortSignal,
      send?: (message: string) => boolean,
    ) {
      try {
        const active = signalFor(signal)
        active.throwIfAborted()
        assertSchema(send ? PiOpenInputSchema : IdInputSchema, input)
        const state = workspace(cwd)
        const documentId = input.documentId
        let url: string
        if (send && "sendFeedback" in input && input.sendFeedback === true) {
          const existing = state.feedbackViewers.get(documentId)
          if (existing) {
            url = await existing.open(documentId, active)
          } else {
            const viewer = new ViewerServer(state.store, undefined, "127.0.0.1", {
              documentId,
              send,
            })
            state.feedbackViewers.set(documentId, viewer)
            try {
              url = await viewer.open(documentId, active)
            } catch (error) {
              state.feedbackViewers.delete(documentId)
              await viewer.close()
              throw error
            }
          }
        } else {
          state.viewer ??= new ViewerServer(state.store)
          url = await state.viewer.open(documentId, active)
        }
        const data: Static<typeof OpenOutputSchema> = {
          ok: true,
          documentId,
          url,
          renderingVerified: false,
        }
        return result(data, `Viewer URL: ${url}\nBrowser rendering is not verified.`)
      } catch (error) {
        return failed(error)
      }
    },
  }

  const close = () => {
    if (!closing) {
      lifetime.abort(new Error("Sketchbook session has shut down."))
      const viewers = [...workspaces.values()].flatMap(({ viewer, feedbackViewers }) => [
        ...(viewer ? [viewer] : []),
        ...feedbackViewers.values(),
      ])
      workspaces.clear()
      closing = Promise.all(viewers.map((viewer) => viewer.close())).then(() => undefined)
    }
    return closing
  }

  return { write, read, open, readBook, edit, close }
}
