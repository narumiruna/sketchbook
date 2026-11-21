import { isUtf8 } from "node:buffer"
import { sourceComments, sourceLanguage } from "./source-comments.mjs"

export const baselinePath = "scripts/comment-baseline.json"

function parseBaseline(source) {
  const data = JSON.parse(source)
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${baselinePath} must be an object mapping paths to comments`)
  }
  const entries = Object.entries(data)
  for (const [path, comments] of entries) {
    if (
      !sourceLanguage(path) ||
      !Array.isArray(comments) ||
      comments.length === 0 ||
      comments.some((comment) => typeof comment !== "string" || !comment)
    ) {
      throw new Error(`Invalid ${baselinePath} entry for ${JSON.stringify(path)}`)
    }
  }
  return new Map(entries)
}

function take(baseline, path, comment) {
  const comments = baseline.get(path)
  const index = comments?.indexOf(comment) ?? -1
  if (index < 0) return false
  comments.splice(index, 1)
  return true
}

export function checkComments(paths, read, previous) {
  const baselineFile = Buffer.from(baselinePath)
  if (!paths.some((path) => path.equals(baselineFile))) {
    throw new Error(`Missing staged ${baselinePath}; keep the file even when it is empty`)
  }
  const remaining = parseBaseline(read(baselineFile))
  if (previous !== undefined) {
    const allowed = parseBaseline(previous)
    for (const [path, comments] of remaining) {
      for (const comment of comments) {
        if (!take(allowed, path, comment)) {
          throw new Error(`Cannot grow or edit ${baselinePath}: ${JSON.stringify([path, comment])}`)
        }
      }
    }
  }

  const failures = []
  for (const pathBytes of paths) {
    const path = pathBytes.toString()
    if (!sourceLanguage(path)) continue
    const source = read(pathBytes)
    let comments
    try {
      comments = sourceComments(path, source)
    } catch (error) {
      throw new Error(`Cannot scan staged ${JSON.stringify(path)}: ${error.message}`, {
        cause: error,
      })
    }
    for (const comment of comments) {
      if (comment.exempt || (isUtf8(pathBytes) && take(remaining, path, comment.text))) continue
      const line = source.slice(0, comment.start).split(/\r\n|[\r\n\u2028\u2029]/).length
      failures.push(
        `${JSON.stringify(path)}:${line}: new or edited comment ${JSON.stringify(comment.text)}`,
      )
    }
  }
  for (const [path, comments] of remaining) {
    for (const comment of comments) {
      failures.push(`Remove unused entry from ${baselinePath}: ${JSON.stringify([path, comment])}`)
    }
  }
  if (failures.length) throw new Error(failures.join("\n"))
}
