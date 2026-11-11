import { resolve } from "node:path"
import { type Static, Type } from "typebox"
import {
  assertSchema,
  DocumentIdSchema,
  StoredDocumentSchema,
  WriteInputSchema,
} from "./document.js"
import type { FileMutationQueue } from "./mutation-queue.js"
import { ViewerServer } from "./server.js"
import { DocumentStore } from "./store.js"

const IdInputSchema = Type.Object({ documentId: DocumentIdSchema }, { additionalProperties: false })
export type ReadInput = Static<typeof IdInputSchema>
export type OpenInput = Static<typeof IdInputSchema>

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
  // Bound errors as well as source output. Errors never include a viewer capability URL.
  const message = (error instanceof Error ? error.message : "Sketchbook operation failed.").slice(
    0,
    2000,
  )
  const data: Failure = { ok: false, error: message }
  return { ...result(data, message), isError: true }
}

function sourceContent(source: string, path: string): { text: string; truncated: boolean } {
  const lines = source.split("\n")
  const head = lines.slice(0, 1900).join("\n")
  const bytes = Buffer.from(head)
  const truncated = lines.length > 1900 || bytes.length > 48_000
  // A streaming decoder omits an incomplete UTF-8 character at the byte boundary.
  const text =
    bytes.length > 48_000
      ? new TextDecoder().decode(bytes.subarray(0, 48_000), { stream: true })
      : head
  return {
    text: truncated
      ? `${text}\n[Content truncated at 48,000 bytes or 1,900 lines. Full document: ${path}. Full data remains in structuredContent.stored.]`
      : text,
    truncated,
  }
}

interface Workspace {
  store: DocumentStore
  viewer?: ViewerServer
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
      state = { store: new DocumentStore(key, mutationQueue) }
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
    description:
      "Create or fully replace a Pi Sketchbook document. Updates require documentId and expectedRevision; read after a conflict. Writes only .pi/sketchbook/*.json, same-directory temporary files, and .pi/sketchbook/.gitignore in the workspace; never changes the workspace root .gitignore. Saving does not verify browser rendering.",
    parameters: WriteInputSchema,
    outputSchema: WriteOutputSchema,
    async execute(input: unknown, cwd: string, signal?: AbortSignal) {
      try {
        const active = signalFor(signal)
        active.throwIfAborted()
        assertSchema(WriteInputSchema, input)
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
        const path = resolve(cwd, ".pi/sketchbook", `${stored.documentId}.json`)
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

  const open = {
    name: "sketchbook_open" as const,
    label: "Sketchbook Open",
    promptSnippet: "Get a read-only Pi Sketchbook viewer URL for the current session",
    description:
      "Return a read-only viewer URL for a saved document; does not launch a browser or verify rendering. Listens on all IPv4 interfaces and automatically uses a private LAN address, or loopback if none is detected. Use only on trusted networks and keep the full capability URL private. The URL expires when the hosting session or server stops; open again after restarting.",
    parameters: IdInputSchema,
    outputSchema: OpenOutputSchema,
    async execute(input: unknown, cwd: string, signal?: AbortSignal) {
      try {
        const active = signalFor(signal)
        active.throwIfAborted()
        assertSchema(IdInputSchema, input)
        const state = workspace(cwd)
        state.viewer ??= new ViewerServer(state.store)
        const url = await state.viewer.open(input.documentId, active)
        const data: Static<typeof OpenOutputSchema> = {
          ok: true,
          documentId: input.documentId,
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
      const viewers = [...workspaces.values()].flatMap((state) =>
        state.viewer ? [state.viewer] : [],
      )
      workspaces.clear()
      closing = Promise.all(viewers.map((viewer) => viewer.close())).then(() => undefined)
    }
    return closing
  }

  return { write, read, open, close }
}
