export type FileMutationQueue = <T>(key: string, operation: () => Promise<T>) => Promise<T>

const mutationQueues = new Map<string, Promise<void>>()

export async function withFileMutationQueue<T>(
  key: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const previous = mutationQueues.get(key) ?? Promise.resolve()
  const result = previous.then(operation)
  const tail = result.then(
    () => {},
    () => {},
  )
  mutationQueues.set(key, tail)
  try {
    return await result
  } finally {
    if (mutationQueues.get(key) === tail) mutationQueues.delete(key)
  }
}
