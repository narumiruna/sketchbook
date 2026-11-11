import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent"
import {
  MAX_DOCUMENT_BYTES,
  type StoredDocument,
  validateDocumentId,
  validateStoredDocument,
  validateWriteInput,
  type WriteInput,
} from "./document.js"

const MAX_STORED_BYTES = MAX_DOCUMENT_BYTES + 4096

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

export class DocumentStore {
  private readonly cwd: string

  constructor(cwd: string) {
    this.cwd = resolve(cwd)
  }

  private async directory(create: boolean): Promise<string> {
    let directory = await realpath(this.cwd)
    for (const part of [".pi", "sketchbook"]) {
      directory = join(directory, part)
      if (create) {
        try {
          await mkdir(directory, { mode: 0o700 })
        } catch (error) {
          if (!hasCode(error, "EEXIST")) throw error
        }
      }
      const info = await lstat(directory)
      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        (await realpath(directory)) !== directory
      ) {
        throw new Error("Sketchbook storage must use real directories inside the workspace")
      }
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

  async read(documentId: string, signal?: AbortSignal): Promise<StoredDocument> {
    validateDocumentId(documentId)
    signal?.throwIfAborted()
    const directory = await this.directory(false)
    const path = join(directory, `${documentId}.json`)
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error("Sketchbook document must be a regular file, not a symlink")
    }
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!(await file.stat()).isFile())
        throw new Error("Sketchbook document must be a regular file")
      const buffer = Buffer.alloc(MAX_STORED_BYTES + 1)
      let length = 0
      while (length < buffer.length) {
        signal?.throwIfAborted()
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
        if (bytesRead === 0) break
        length += bytesRead
      }
      if (length > MAX_STORED_BYTES)
        throw new Error("Stored sketchbook document exceeds the size limit")
      signal?.throwIfAborted()
      const stored = validateStoredDocument(JSON.parse(buffer.toString("utf8", 0, length)))
      if (stored.documentId !== documentId)
        throw new Error("Stored sketchbook document ID does not match its file")
      return stored
    } finally {
      await file.close()
    }
  }

  async write(
    input: WriteInput,
    signal?: AbortSignal,
  ): Promise<{ stored: StoredDocument; path: string }> {
    signal?.throwIfAborted()
    validateWriteInput(input)
    // Snapshot before the first await so callers cannot change a pending transaction.
    const snapshot: WriteInput = JSON.parse(JSON.stringify(input))
    const directory = await this.directory(true)
    await withFileMutationQueue(join(directory, ".gitignore"), () => this.ensureIgnore(directory))
    const documentId = snapshot.documentId ?? randomUUID()
    const path = join(directory, `${documentId}.json`)
    return withFileMutationQueue(path, async () => {
      signal?.throwIfAborted()
      await this.directory(false)
      let revision = 1
      if (snapshot.documentId !== undefined) {
        const current = await this.read(documentId, signal)
        if (current.revision !== snapshot.expectedRevision) {
          throw new Error(
            `Revision conflict: expected ${snapshot.expectedRevision}, current ${current.revision}; use sketchbook_read before retrying`,
          )
        }
        if (current.revision === Number.MAX_SAFE_INTEGER)
          throw new Error("Sketchbook revision limit reached")
        revision = current.revision + 1
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
      const temporary = join(directory, `.${documentId}.${randomUUID()}.tmp`)
      try {
        const file = await open(
          temporary,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o600,
        )
        try {
          await file.writeFile(`${JSON.stringify(stored)}\n`, { encoding: "utf8", signal })
          await file.sync()
        } finally {
          await file.close()
        }
        await this.directory(false)
        signal?.throwIfAborted()
        // The atomic rename is the commit point. Do not report cancellation after it.
        await rename(temporary, path)
      } catch (error) {
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
        throw error
      }
      return { stored, path }
    })
  }
}
