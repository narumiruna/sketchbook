import { describe, expect, test } from "vitest"
import { withFileMutationQueue } from "../src/mutation-queue.js"

describe("withFileMutationQueue", () => {
  test("serializes each key and keeps newer entries when older operations finish", async () => {
    const firstStarted = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    const secondStarted = Promise.withResolvers<void>()
    const releaseSecond = Promise.withResolvers<void>()
    const order: number[] = []
    const first = withFileMutationQueue("shared", async () => {
      order.push(1)
      firstStarted.resolve()
      await releaseFirst.promise
      return 1
    })
    await firstStarted.promise
    const second = withFileMutationQueue("shared", async () => {
      order.push(2)
      secondStarted.resolve()
      await releaseSecond.promise
      return 2
    })
    releaseFirst.resolve()
    await expect(first).resolves.toBe(1)
    await secondStarted.promise
    const third = withFileMutationQueue("shared", () => {
      order.push(3)
      return 3
    })
    try {
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(order).toEqual([1, 2])
    } finally {
      releaseSecond.resolve()
      await Promise.all([second, third])
    }
    await expect(second).resolves.toBe(2)
    await expect(third).resolves.toBe(3)
    expect(order).toEqual([1, 2, 3])
  })

  test("does not block mutations for other keys", async () => {
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holding = withFileMutationQueue("held", async () => {
      started.resolve()
      await release.promise
    })
    await started.promise
    try {
      await expect(withFileMutationQueue("independent", () => 42)).resolves.toBe(42)
    } finally {
      release.resolve()
      await holding
    }
  })

  test.each(["synchronous", "asynchronous"])(
    "continues queued and later operations after %s failures",
    async (mode) => {
      const failure = new Error("Mutation failed")
      const failed = withFileMutationQueue("failure", () => {
        if (mode === "synchronous") throw failure
        return Promise.reject(failure)
      })
      const next = withFileMutationQueue("failure", () => "queued")
      await expect(failed).rejects.toBe(failure)
      await expect(next).resolves.toBe("queued")
      await expect(withFileMutationQueue("failure", () => "retry")).resolves.toBe("retry")
    },
  )
})
