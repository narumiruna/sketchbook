import { extname } from "node:path"
import { parse as parseJs } from "@babel/parser"
import { tokenize, tokenTypes } from "css-tree"
import { createScanner, SyntaxKind } from "jsonc-parser"
import { parse as parseHtml } from "parse5"
import { parse as parseShell, walk } from "sh-syntax/sync"
import { Parser } from "yaml"

export function sourceLanguage(path) {
  const extension = extname(path)
  if (/^\.[cm]?[jt]sx?$/.test(extension)) return "js"
  if (extension === ".css") return "css"
  if (extension === ".html" || extension === ".htm") return "html"
  if (extension === ".yml" || extension === ".yaml") return "yaml"
  if (extension === ".jsonc" || /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(path)) return "jsonc"
  if (extension === ".sh" || extension === ".bash" || /^\.husky\/[^/.][^/]*$/.test(path))
    return "shell"
}

function javascriptComments(path, source, add) {
  const typescript = /\.[cm]?tsx?$/.test(path)
  const tree = parseJs(source, {
    sourceType: "unambiguous",
    plugins: [
      ...(typescript ? ["typescript"] : []),
      ...(!typescript || path.endsWith(".tsx") ? ["jsx"] : []),
    ],
  })
  const apiDocs = new Set()
  if (path.startsWith("src/")) {
    for (const node of tree.program.body) {
      if (node.type !== "ExportNamedDeclaration" && node.type !== "ExportDefaultDeclaration") {
        continue
      }
      const doc = node.leadingComments?.at(-1)
      if (
        node.declaration &&
        doc?.type === "CommentBlock" &&
        doc.value.startsWith("*") &&
        !source.slice(doc.end, node.start).trim()
      ) {
        apiDocs.add(doc.start)
      }
    }
  }
  const interpreter = tree.program.interpreter
  if (interpreter) add(interpreter.start, interpreter.end, "directive")
  for (const comment of tree.comments) {
    add(comment.start, comment.end, apiDocs.has(comment.start) ? "api" : undefined)
  }
}

function htmlComments(node, add) {
  if (node.nodeName === "#comment") {
    add(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset)
  }
  for (const child of node.childNodes ?? []) htmlComments(child, add)
  if (node.content) htmlComments(node.content, add)
}

function yamlComments(node, add) {
  if (node?.type === "comment") {
    add(node.offset, node.offset + node.source.length)
  } else if (node && typeof node === "object") {
    for (const value of Object.values(node)) yamlComments(value, add)
  }
}

function exception(language, text) {
  const body = text.replace(/^(?:\/\/|\/\*+|<!--|#)\s*/, "")
  if (/^(?:\*\s*)?(?:@(?:license|preserve)\b|SPDX-License-Identifier:|Copyright\s)/.test(body)) {
    return "notice"
  }
  if (/^biome-ignore(?:-all|-start|-end)?\s+(?:lint|format|assist)(?:[/:\s]|$)/.test(body)) {
    return "directive"
  }
  if (
    language === "js" &&
    /^(?:@ts-(?:check|nocheck|ignore|expect-error)\b|\/\s*<reference\s)/.test(body)
  ) {
    return "directive"
  }
  if (language === "shell" && /^shellcheck\s+\w+=/.test(body)) return "directive"
}

export function sourceComments(path, source) {
  const language = sourceLanguage(path)
  const comments = []
  const add = (start, end, exempt) => {
    const text = source.slice(start, end)
    comments.push({ start, end, text, exempt: exempt ?? exception(language, text) })
  }

  switch (language) {
    case "js":
      javascriptComments(path, source, add)
      break
    case "css":
      tokenize(source, (type, start, end) => {
        if (type === tokenTypes.Comment) add(start, end)
      })
      break
    case "html":
      htmlComments(parseHtml(source, { sourceCodeLocationInfo: true }), add)
      break
    case "yaml":
      for (const token of new Parser().parse(source)) yamlComments(token, add)
      break
    case "jsonc": {
      const scanner = createScanner(source)
      for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
        if (token === SyntaxKind.LineCommentTrivia || token === SyntaxKind.BlockCommentTrivia) {
          add(scanner.getTokenOffset(), scanner.getPosition())
        }
      }
      break
    }
    case "shell": {
      const bytes = Buffer.from(source)
      walk(parseShell(source, { keepComments: true }), (node) => {
        if (node.type !== "Comment") return
        const start = bytes.subarray(0, node.start).toString().length
        const end = start + 1 + node.text.length
        add(start, end, start === 0 && source.startsWith("#!") ? "directive" : undefined)
      })
      break
    }
  }
  return comments.sort((a, b) => a.start - b.start)
}
