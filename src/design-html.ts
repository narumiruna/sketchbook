import { ident, parse as parseCss, walk } from "css-tree"
import {
  type DefaultTreeAdapterTypes,
  parse,
  parseFragment,
  serialize,
  serializeOuter,
  defaultTreeAdapter as tree,
} from "parse5"
import { inspectStaticSvg, SVG_NAMESPACE } from "./static-svg.js"

export const MAX_DESIGN_HTML_BYTES = 128 * 1024
const htmlNamespace = "http://www.w3.org/1999/xhtml"
const tags = new Set(
  `html head body title style main section article header footer div span p h1 h2 h3 h4 h5 h6
   figure figcaption aside blockquote hr ul ol li dl dt dd strong em b i small sub sup code pre br
   table caption thead tbody tfoot tr th td`.split(/\s+/),
)
const attrs = new Set(
  `id class lang dir style role tabindex colspan rowspan scope aria-label aria-labelledby
   aria-describedby aria-hidden aria-roledescription`.split(/\s+/),
)
const frameHead = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html,body{height:auto!important;min-height:0!important}html{overflow:hidden!important}</style>`

function reject(reason: string): never {
  throw new Error(`Invalid Diagram Design HTML: ${reason}`)
}

function validateCss(source: string, context: "stylesheet" | "declarationList") {
  const ast = parseCss(source, {
    context,
    parseCustomProperty: true,
    onParseError: () => reject("malformed CSS"),
  })
  walk(ast, (node) => {
    if (node.type === "Raw") reject("unsupported CSS syntax")
    if (node.type === "Atrule" && ident.decode(node.name).toLowerCase() !== "media") {
      reject("only CSS @media rules are supported")
    }
    if (node.type === "Url" && !/^#[\w:.-]+$/.test(node.value)) {
      reject("external CSS resources are not supported")
    }
    if (
      node.type === "Function" &&
      /^(?:[\w-]+-)?(?:image-set|image|src|url)$/i.test(ident.decode(node.name))
    ) {
      reject("CSS image sources are not supported")
    }
    if (
      node.type === "Declaration" &&
      /^(?:-\w+-)?(?:animation|transition)(?:-|$)/i.test(ident.decode(node.property))
    ) {
      reject("animation is not supported")
    }
  })
}

export function prepareDesignHtml(source: string): string {
  if (new TextEncoder().encode(source).byteLength > MAX_DESIGN_HTML_BYTES)
    reject("file exceeds 128 KiB")
  const document = parse(source, { onParseError: () => reject("malformed HTML") })
  let figures = 0
  let count = 0
  const check = (node: DefaultTreeAdapterTypes.ParentNode, depth = 0) => {
    if (depth > 64) reject("document is too deeply nested")
    for (const child of [...node.childNodes]) {
      if (++count > 4096) reject("document is too complex")
      if (!tree.isElementNode(child)) continue
      if (child.namespaceURI === SVG_NAMESPACE && child.tagName === "svg") {
        inspectStaticSvg(serializeOuter(child))
        figures++
        continue
      }
      if (child.namespaceURI !== htmlNamespace) reject("unsupported namespace")
      if (child.tagName === "meta" || child.tagName === "link") {
        if (
          child.parentNode &&
          "tagName" in child.parentNode &&
          child.parentNode.tagName === "head"
        ) {
          const options = new Map(child.attrs.map(({ name, value }) => [name, value]))
          if (
            (child.tagName === "meta" &&
              !options.has("http-equiv") &&
              (options.has("charset") || options.get("name")?.toLowerCase() === "viewport")) ||
            (child.tagName === "link" && options.get("rel")?.toLowerCase() === "stylesheet")
          ) {
            tree.detachNode(child)
            continue
          }
        }
        reject("unsupported metadata or link")
      }
      if (!tags.has(child.tagName)) reject("unsupported HTML element")
      for (const { name, value, namespace } of child.attrs) {
        if (namespace || !attrs.has(name)) reject("unsupported HTML attribute")
        if (name === "style") validateCss(value, "declarationList")
      }
      if (child.tagName === "style") {
        const css = child.childNodes
          .filter(tree.isTextNode)
          .map((part) => part.value)
          .join("")
        validateCss(css, "stylesheet")
      }
      check(child, depth + 1)
    }
  }
  check(document)
  if (figures === 0) reject("no inline SVG diagrams")
  const html = document.childNodes.find(tree.isElementNode)
  const head = html?.childNodes.find((node) => tree.isElementNode(node) && node.tagName === "head")
  if (!head || !tree.isElementNode(head)) reject("missing document head")
  const fragment = parseFragment(head, frameHead, {})
  for (const child of [...fragment.childNodes].reverse()) {
    const first = head.childNodes[0]
    tree.detachNode(child)
    if (first) tree.insertBefore(head, child, first)
    else tree.appendChild(head, child)
  }
  return serialize(document)
}
