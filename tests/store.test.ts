import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MAX_DOCUMENT_BYTES, type SketchbookDocument } from "../src/document.js"
import * as mutationQueue from "../src/mutation-queue.js"
import { DocumentStore } from "../src/store.js"

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return { ...actual, open: vi.fn(actual.open), rename: vi.fn(actual.rename) }
})

const document: SketchbookDocument = {
  schemaVersion: 1,
  title: "Example",
  blocks: [{ id: "text", type: "markdown", markdown: "A document." }],
}
let cwd: string
let outside: string
let store: DocumentStore

beforeEach(async () => {
  cwd = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "pi-sketchbook-store-")))
  outside = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "pi-sketchbook-outside-")))
  store = new DocumentStore(cwd)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([
    fs.rm(cwd, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true }),
  ])
})

describe("DocumentStore", () => {
  test("persists and replaces a versioned snapshot without changing root ignore", async () => {
    await fs.writeFile(join(cwd, ".gitignore"), "# User rules\n")
    const input = structuredClone(document)
    const pending = store.write({ document: input })
    input.title = "Changed after invocation"
    const { stored, path } = await pending
    expect(stored.document.title).toBe("Example")
    expect(stored.revision).toBe(1)
    expect(path).toBe(join(cwd, ".pi", "sketchbook", `${stored.documentId}.json`))
    expect(await store.read(stored.documentId)).toEqual(stored)
    expect(await fs.readFile(join(cwd, ".gitignore"), "utf8")).toBe("# User rules\n")
    expect(await fs.readFile(join(cwd, ".pi", "sketchbook", ".gitignore"), "utf8")).toBe("*\n")
    const result = await store.write({
      document: { ...document, title: "Updated" },
      documentId: stored.documentId,
      expectedRevision: 1,
    })
    expect(result.stored.revision).toBe(2)
    expect((await store.read(stored.documentId)).document.title).toBe("Updated")
    expect((await fs.stat(path)).mode & 0o777).toBe(0o600)
    // A new extension/store instance can read workspace artifacts after reload.
    expect(await new DocumentStore(cwd).read(stored.documentId)).toEqual(result.stored)
  })

  test.each([false, true])(
    "rejects concurrent updates across stores without losing a revision (workspace alias: %s)",
    async (useAlias) => {
      const { stored } = await store.write({ document })
      const alias = join(outside, "workspace")
      if (useAlias) await fs.symlink(cwd, alias, "dir")
      const otherStore = new DocumentStore(useAlias ? alias : cwd)
      const input = { document, documentId: stored.documentId, expectedRevision: 1 }
      const results = await Promise.allSettled([store.write(input), otherStore.write(input)])
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
      const failure = results.find((r) => r.status === "rejected")
      expect(failure?.status === "rejected" && String(failure.reason)).toContain(
        "Revision conflict",
      )
      expect((await store.read(stored.documentId)).revision).toBe(2)
      await expect(otherStore.write(input)).rejects.toThrow("Revision conflict")
    },
  )

  test("keeps the input snapshot while another transaction holds the document queue", async () => {
    const { stored, path } = await store.write({ document })
    const release = Promise.withResolvers<void>()
    const holding = mutationQueue.withFileMutationQueue(path, () => release.promise)
    const queued = Promise.withResolvers<void>()
    const enqueue = mutationQueue.withFileMutationQueue
    vi.spyOn(mutationQueue, "withFileMutationQueue").mockImplementation((key, operation) => {
      const pending = enqueue(key, operation)
      if (key === path) queued.resolve()
      return pending
    })
    const input = {
      document: structuredClone(document),
      documentId: stored.documentId,
      expectedRevision: 1,
    }
    const pending = new DocumentStore(cwd).write(input)
    await queued.promise
    input.document.title = "Changed while queued"
    input.document.blocks = []
    input.documentId = randomUUID()
    input.expectedRevision = 99
    release.resolve()
    await holding
    const result = await pending
    expect(result.stored.documentId).toBe(stored.documentId)
    expect(result.stored.revision).toBe(2)
    expect(result.stored.document).toEqual(document)
    expect(await store.read(stored.documentId)).toEqual(result.stored)
  })

  test("preserves the previous file and removes temporary files if rename fails", async () => {
    const { stored, path } = await store.write({ document })
    const before = await fs.readFile(path, "utf8")
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error("Simulated disk failure"))
    await expect(
      store.write({
        document: { ...document, title: "Never committed" },
        documentId: stored.documentId,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("disk failure")
    expect(await fs.readFile(path, "utf8")).toBe(before)
    expect(
      (await fs.readdir(join(cwd, ".pi", "sketchbook"))).filter((name) => name.endsWith(".tmp")),
    ).toEqual([])
    const retried = await new DocumentStore(cwd).write({
      document,
      documentId: stored.documentId,
      expectedRevision: 1,
    })
    expect(retried.stored.revision).toBe(2)
    expect(await store.read(stored.documentId)).toEqual(retried.stored)
  })

  test("checks cancellation after waiting for the document mutation queue", async () => {
    const { stored, path } = await store.write({ document })
    const controller = new AbortController()
    const release = Promise.withResolvers<void>()
    const holding = mutationQueue.withFileMutationQueue(path, () => release.promise)
    const queued = Promise.withResolvers<void>()
    const enqueue = mutationQueue.withFileMutationQueue
    vi.spyOn(mutationQueue, "withFileMutationQueue").mockImplementation((key, operation) => {
      const pending = enqueue(key, operation)
      if (key === path) queued.resolve()
      return pending
    })
    const pending = store.write(
      { document, documentId: stored.documentId, expectedRevision: 1 },
      controller.signal,
    )
    await queued.promise
    controller.abort()
    release.resolve()
    await holding
    await expect(pending).rejects.toThrow()
    expect((await store.read(stored.documentId)).revision).toBe(1)
    await expect(store.read(stored.documentId, controller.signal)).rejects.toThrow()
    await expect(store.write({ document }, controller.signal)).rejects.toThrow()
    const retried = await store.write({
      document,
      documentId: stored.documentId,
      expectedRevision: 1,
    })
    expect(retried.stored.revision).toBe(2)
  })

  test("removes temporary files when cancelled before the rename commit point", async () => {
    const { stored, path } = await store.write({ document })
    const before = await fs.readFile(path, "utf8")
    const controller = new AbortController()
    const { open } = await vi.importActual<typeof fs>("node:fs/promises")
    vi.mocked(fs.open)
      .mockImplementationOnce(open)
      .mockImplementationOnce(open)
      .mockImplementationOnce(async (...args) => {
        const file = await open(...args)
        const sync = file.sync.bind(file)
        vi.spyOn(file, "sync").mockImplementationOnce(async () => {
          await sync()
          controller.abort()
        })
        return file
      })
    await expect(
      store.write(
        { document, documentId: stored.documentId, expectedRevision: 1 },
        controller.signal,
      ),
    ).rejects.toThrow()
    expect(await fs.readFile(path, "utf8")).toBe(before)
    expect(
      (await fs.readdir(join(cwd, ".pi", "sketchbook"))).filter((name) => name.endsWith(".tmp")),
    ).toEqual([])
  })

  test("does not report cancellation after the rename commit point", async () => {
    const { stored } = await store.write({ document })
    const controller = new AbortController()
    const { rename } = await vi.importActual<typeof fs>("node:fs/promises")
    vi.mocked(fs.rename).mockImplementationOnce(async (...args) => {
      await rename(...args)
      controller.abort()
    })
    const result = await store.write(
      { document, documentId: stored.documentId, expectedRevision: 1 },
      controller.signal,
    )
    expect(result.stored.revision).toBe(2)
    expect((await store.read(stored.documentId)).revision).toBe(2)
  })

  test("does not create directories for invalid IDs or documents", async () => {
    await expect(store.read("../outside")).rejects.toThrow()
    await expect(
      store.write({ document: { ...document, schemaVersion: 2 } as unknown as SketchbookDocument }),
    ).rejects.toThrow()
    await expect(fs.stat(join(cwd, ".pi"))).rejects.toThrow()
    await expect(store.read(randomUUID())).rejects.toThrow()
  })

  test.each([".pi", ".pi/sketchbook"])(
    "refuses symlinked storage directory %s",
    async (relative) => {
      if (relative.includes("/")) await fs.mkdir(join(cwd, ".pi"))
      await fs.symlink(outside, join(cwd, relative), "dir")
      await expect(store.write({ document })).rejects.toThrow("real directories")
      expect(await fs.readdir(outside)).toEqual([])
    },
  )

  test("removes a failed new artifact ignore and restores exclusions on retry", async () => {
    const failure = Object.assign(new Error("Simulated full disk"), { code: "ENOSPC" })
    const { open } = await vi.importActual<typeof fs>("node:fs/promises")
    vi.mocked(fs.open).mockImplementationOnce(async (...args) => {
      const file = await open(...args)
      vi.spyOn(file, "writeFile").mockRejectedValueOnce(failure)
      return file
    })
    await expect(store.write({ document })).rejects.toBe(failure)
    const ignore = join(cwd, ".pi", "sketchbook", ".gitignore")
    await expect(fs.lstat(ignore)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await fs.readdir(join(cwd, ".pi", "sketchbook"))).toEqual([])

    const { stored } = await store.write({ document })
    expect(await fs.readFile(ignore, "utf8")).toBe("*\n")
    expect(await store.read(stored.documentId)).toEqual(stored)
  })

  test("preserves a pre-existing artifact ignore", async () => {
    const directory = join(cwd, ".pi", "sketchbook")
    await fs.mkdir(directory, { recursive: true })
    const ignore = join(directory, ".gitignore")
    await fs.writeFile(ignore, "# User exclusions\n*.json\n")
    await store.write({ document })
    expect(await fs.readFile(ignore, "utf8")).toBe("# User exclusions\n*.json\n")
  })

  test("refuses a symlinked artifact ignore without changing its target", async () => {
    await fs.mkdir(join(cwd, ".pi", "sketchbook"), { recursive: true })
    const target = join(outside, "ignore")
    await fs.writeFile(target, "User data")
    await fs.symlink(target, join(cwd, ".pi", "sketchbook", ".gitignore"))
    await expect(store.write({ document })).rejects.toThrow("regular file")
    expect(await fs.readFile(target, "utf8")).toBe("User data")
  })

  test("refuses document symlinks for reads and updates", async () => {
    const { stored, path } = await store.write({ document })
    const target = join(outside, "document.json")
    await fs.rename(path, target)
    await fs.symlink(target, path)
    await expect(store.read(stored.documentId)).rejects.toThrow("regular file")
    await expect(
      store.write({ document, documentId: stored.documentId, expectedRevision: 1 }),
    ).rejects.toThrow("regular file")
    expect(JSON.parse(await fs.readFile(target, "utf8")).revision).toBe(1)
  })

  test("rejects corrupted, future-version, mismatched and oversized stored files without overwriting them", async () => {
    const { stored, path } = await store.write({ document })
    const badFiles = [
      "{not JSON",
      JSON.stringify({ ...stored, document: { ...document, schemaVersion: 2 } }),
      JSON.stringify({ ...stored, documentId: randomUUID() }),
      JSON.stringify({ ...stored, updatedAt: "not a date" }),
      " ".repeat(MAX_DOCUMENT_BYTES + 4097),
    ]
    for (const contents of badFiles) {
      await fs.writeFile(path, contents)
      await expect(store.read(stored.documentId)).rejects.toThrow()
      await expect(
        store.write({ document, documentId: stored.documentId, expectedRevision: 1 }),
      ).rejects.toThrow()
      expect(await fs.readFile(path, "utf8")).toBe(contents)
    }
  })
})
