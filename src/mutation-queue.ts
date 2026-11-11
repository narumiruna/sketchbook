export type FileMutationQueue = <T>(key: string, operation: () => Promise<T>) => Promise<T>

// Callers supply canonical paths so all stores share the same queue keys.
const mutationQueues = new Map<string, Promise<void>>()

export async function withFileMutationQueue<T>(
  key: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const previous = mutationQueues.get(key) ?? Promise.resolve()
  const result = previous.then(operation)
  // A failed operation must not block the next operation for this key.
  const tail = result.then(
    () => {},
    () => {},
  )
  mutationQueues.set(key, tail)
  try {
    return await result
  } finally {
    // An older operation must not remove a newer operation's queue entry.
    if (mutationQueues.get(key) === tail) mutationQueues.delete(key)
  }
}
