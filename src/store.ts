import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import {
  applyBookEdit,
  applyContentEdit,
  isDocumentEdit,
  MAX_BOOK_BYTES,
  type StoredBook,
  validateBookEditInput,
  validateStoredBook,
} from "./book.js"
import {
  MAX_DOCUMENT_BYTES,
  type StoredDocument,
  validateDocumentId,
  validateStoredDocument,
  validateWriteInput,
  type WriteInput,
} from "./document.js"
import { type FileMutationQueue, withFileMutationQueue } from "./mutation-queue.js"

export const STORAGE_DIR = ".sketchbook"

const MAX_STORED_BYTES = MAX_DOCUMENT_BYTES + 4096

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

function nextRevision(expected: number, current: number, readTool: string): number {
  if (expected !== current) {
    throw new Error(
      `Revision conflict: expected ${expected}, current ${current}; use ${readTool} before retrying`,
    )
  }
  if (current === Number.MAX_SAFE_INTEGER) throw new Error("Sketchbook revision limit reached")
  return current + 1
}

async function legacyDirectory(workspace: string): Promise<string | undefined> {
  try {
    if (!(await lstat(join(workspace, ".pi"))).isDirectory()) return
  } catch (error) {
    if (hasCode(error, "ENOENT")) return
    throw error
  }
  for (const relative of [".pi/sketchbook", ".pi/canvas"]) {
    try {
      if ((await lstat(join(workspace, relative))).isDirectory()) return relative
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error
    }
  }
}

async function readRecord(
  path: string,
  maxBytes: number,
  label: string,
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted()
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Sketchbook ${label} must be a regular file, not a symlink`)
  }
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!(await file.stat()).isFile()) throw new Error(`Sketchbook ${label} must be a regular file`)
    const buffer = Buffer.alloc(maxBytes + 1)
    let length = 0
    while (length < buffer.length) {
      signal?.throwIfAborted()
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
      if (bytesRead === 0) break
      length += bytesRead
    }
    if (length > maxBytes) throw new Error(`Stored sketchbook ${label} exceeds the size limit`)
    signal?.throwIfAborted()
    return JSON.parse(buffer.toString("utf8", 0, length))
  } finally {
    await file.close()
  }
}

export class DocumentStore {
  private readonly cwd: string

  constructor(
    cwd: string,
    private readonly mutationQueue?: FileMutationQueue,
  ) {
    this.cwd = resolve(cwd)
  }

  private async directory(create: boolean): Promise<string> {
    const workspace = await realpath(this.cwd)
    const directory = join(workspace, STORAGE_DIR)
    const info = await lstat(directory).catch(async (error: unknown) => {
      if (!hasCode(error, "ENOENT")) throw error
      const legacy = await legacyDirectory(workspace)
      if (legacy) {
        throw new Error(
          `Sketchbook storage moved to ${STORAGE_DIR}/. Stop all Sketchbook sessions in this workspace, back up your files, then move ${legacy}/ to ${STORAGE_DIR}/ without overwriting existing files.`,
        )
      }
      if (!create) throw error
      try {
        await mkdir(directory, { mode: 0o700 })
      } catch (mkdirError) {
        if (!hasCode(mkdirError, "EEXIST")) throw mkdirError
      }
      return lstat(directory)
    })
    if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(directory)) !== directory) {
      throw new Error("Sketchbook storage must use a real directory inside the workspace")
    }
    return directory
  }

  private async ensureIgnore(directory: string): Promise<void> {
    const path = join(directory, ".gitignore")
    try {
      const file = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      )
      try {
        try {
          await file.writeFile("*\n", "utf8")
        } finally {
          await file.close()
        }
      } catch (error) {
        try {
          await unlink(path)
        } catch (cleanupError) {
          if (!hasCode(cleanupError, "ENOENT")) {
            throw new AggregateError(
              [error, cleanupError],
              "Sketchbook ignore creation and cleanup failed",
            )
          }
        }
        throw error
      }
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink()) {
        throw new Error("Sketchbook artifact .gitignore must be a regular file")
      }
    }
  }

  private async checkDirectory(directory: string): Promise<void> {
    if ((await this.directory(false)) !== directory) {
      throw new Error("Sketchbook storage directory changed during the write")
    }
  }

  private async readDocument(
    directory: string,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<StoredDocument> {
    const data = await readRecord(
      join(directory, `${documentId}.json`),
      MAX_STORED_BYTES,
      "document",
      signal,
    )
    signal?.throwIfAborted()
    const stored = validateStoredDocument(data)
    if (stored.documentId !== documentId)
      throw new Error("Stored sketchbook document ID does not match its file")
    return stored
  }

  private async readSidecar(
    directory: string,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<StoredBook | undefined> {
    try {
      const data = await readRecord(
        join(directory, `${documentId}.book.json`),
        MAX_BOOK_BYTES,
        "book",
        signal,
      )
      signal?.throwIfAborted()
      const stored = validateStoredBook(data)
      if (stored.documentId !== documentId)
        throw new Error("Stored sketchbook book ID does not match its file")
      return stored
    } catch (error) {
      signal?.throwIfAborted()
      if (!hasCode(error, "ENOENT")) throw error
    }
  }

  async read(documentId: string, signal?: AbortSignal): Promise<StoredDocument> {
    validateDocumentId(documentId)
    signal?.throwIfAborted()
    return this.readDocument(await this.directory(false), documentId, signal)
  }

  async readBook(documentId: string, signal?: AbortSignal): Promise<StoredBook | undefined> {
    validateDocumentId(documentId)
    signal?.throwIfAborted()
    const directory = await this.directory(false)
    await this.readDocument(directory, documentId, signal)
    return this.readSidecar(directory, documentId, signal)
  }

  async readViewer(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<StoredDocument & { book?: StoredBook }> {
    validateDocumentId(documentId)
    signal?.throwIfAborted()
    const directory = await this.directory(false)
    const stored = await this.readDocument(directory, documentId, signal)
    const book = await this.readSidecar(directory, documentId, signal)
    return book ? { ...stored, book } : stored
  }

  private async commit(
    directory: string,
    path: string,
    stored: StoredDocument | StoredBook,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted()
    const source = `${JSON.stringify(stored)}\n`
    if ("chapters" in stored && Buffer.byteLength(source, "utf8") > MAX_BOOK_BYTES)
      throw new Error(`Sketchbook book exceeds ${MAX_BOOK_BYTES} bytes`)
    const temporary = join(directory, `.${stored.documentId}.${randomUUID()}.tmp`)
    let created = false
    try {
      const file = await open(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      )
      created = true
      try {
        await file.writeFile(source, { encoding: "utf8", signal })
        await file.sync()
      } finally {
        await file.close()
      }
      await this.checkDirectory(directory)
      signal?.throwIfAborted()
      await rename(temporary, path)
    } catch (error) {
      if (created) {
        try {
          await unlink(temporary)
        } catch (cleanupError) {
          if (!hasCode(cleanupError, "ENOENT")) {
            throw new AggregateError(
              [error, cleanupError],
              "Sketchbook write and temporary cleanup failed",
            )
          }
        }
      }
      throw error
    }
  }

  async write(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<{ stored: StoredDocument; path: string }> {
    signal?.throwIfAborted()
    const snapshot: WriteInput = JSON.parse(JSON.stringify(validateWriteInput(input)))
    const directory = await this.directory(true)
    const mutate = this.mutationQueue ?? withFileMutationQueue
    await mutate(join(directory, ".gitignore"), () => this.ensureIgnore(directory))
    const documentId = snapshot.documentId ?? randomUUID()
    const path = join(directory, `${documentId}.json`)
    return mutate(path, async () => {
      signal?.throwIfAborted()
      await this.checkDirectory(directory)
      let revision = 1
      if (snapshot.expectedRevision !== undefined) {
        const current = await this.readDocument(directory, documentId, signal)
        revision = nextRevision(snapshot.expectedRevision, current.revision, "sketchbook_read")
      } else {
        try {
          await lstat(path)
          throw new Error("Generated sketchbook document ID already exists; create again")
        } catch (error) {
          if (!hasCode(error, "ENOENT")) throw error
        }
      }
      const stored: StoredDocument = {
        documentId,
        revision,
        updatedAt: new Date().toISOString(),
        document: snapshot.document,
      }
      await this.commit(directory, path, stored, signal)
      return { stored, path }
    })
  }

  async editBook(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<{ revision: number; record: "document" | "book" }> {
    signal?.throwIfAborted()
    const { documentId, expectedRevision, operation } = structuredClone(
      validateBookEditInput(input),
    )
    const documentEdit = isDocumentEdit(operation)
    const record = documentEdit ? "document" : "book"
    const directory = await this.directory(false)
    const path = join(directory, `${documentId}${documentEdit ? "" : ".book"}.json`)
    const mutate = this.mutationQueue ?? withFileMutationQueue
    await mutate(join(directory, ".gitignore"), () => {
      signal?.throwIfAborted()
      return this.ensureIgnore(directory)
    })
    return mutate(path, async () => {
      signal?.throwIfAborted()
      await this.checkDirectory(directory)
      const document = await this.readDocument(directory, documentId, signal)
      const updatedAt = new Date().toISOString()
      let stored: StoredDocument | StoredBook
      if (documentEdit) {
        const revision = nextRevision(expectedRevision, document.revision, "sketchbook_read")
        applyContentEdit(document.document.blocks, operation)
        stored = validateStoredDocument({ ...document, revision, updatedAt })
      } else {
        const current = await this.readSidecar(directory, documentId, signal)
        const revision = nextRevision(
          expectedRevision,
          current?.revision ?? 0,
          "sketchbook_read_book",
        )
        const book: StoredBook = {
          documentId,
          revision,
          updatedAt,
          sections: current?.sections ?? [],
          chapters: current?.chapters ?? [],
        }
        applyBookEdit(book, operation)
        stored = validateStoredBook(book)
      }
      await this.commit(directory, path, stored, signal)
      return { revision: stored.revision, record }
    })
  }
}
