import { ident, parse, walk } from "css-tree"
import { SaxesParser } from "saxes"

export const MAX_SVG_BYTES = 128 * 1024
export const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const xmlNamespace = "http://www.w3.org/XML/1998/namespace"
const xmlnsNamespace = "http://www.w3.org/2000/xmlns/"
const elements = new Set(
  `svg title desc defs style g symbol path rect circle ellipse line polyline polygon text tspan
   marker pattern linearGradient radialGradient stop clipPath mask filter feTurbulence
   feDisplacementMap feGaussianBlur feOffset feBlend feColorMatrix feFlood feMerge feMergeNode
   feComposite feComponentTransfer feFuncR feFuncG feFuncB feFuncA`.split(/\s+/),
)
const attributes = new Set(
  `id class style role aria-label aria-labelledby aria-describedby aria-hidden lang focusable
   viewBox preserveAspectRatio width height x y x1 y1 x2 y2 cx cy r rx ry d points pathLength
   dx dy rotate textLength lengthAdjust dominant-baseline alignment-baseline baseline-shift
   text-anchor font-family font-size font-style font-weight letter-spacing word-spacing
   text-decoration paint-order vector-effect visibility display opacity color overflow
   fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin
   stroke-miterlimit stroke-opacity stroke-dasharray stroke-dashoffset transform transform-origin
   marker-start marker-mid marker-end markerWidth markerHeight markerUnits refX refY orient
   patternUnits patternContentUnits patternTransform gradientUnits gradientTransform fx fy fr
   spreadMethod offset stop-color stop-opacity clip-path clip-rule clipPathUnits mask maskUnits
   mask-type maskContentUnits filter filterUnits primitiveUnits result in in2 stdDeviation operator
   radius baseFrequency numOctaves seed stitchTiles scale xChannelSelector yChannelSelector
   type values mode flood-color flood-opacity color-interpolation-filters k1 k2 k3 k4
   slope intercept amplitude exponent tableValues`.split(/\s+/),
)
const cssFunctions = new Set(
  `var calc min max clamp rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix
   translate translatex translatey rotate scale scalex scaley matrix skewx skewy`.split(/\s+/),
)
const paint = new Set([
  "fill",
  "stroke",
  "filter",
  "clip-path",
  "mask",
  "marker-start",
  "marker-mid",
  "marker-end",
])
const definitionId = /^[A-Za-z_][\w:.-]*$/

function reject(reason: string): never {
  throw new Error(`Invalid static SVG: ${reason}`)
}

function checkCss(value: string, context: "stylesheet" | "declarationList" | "value") {
  const ast = parse(value, {
    context,
    parseCustomProperty: true,
    onParseError: () => reject("malformed CSS"),
  })
  walk(ast, (node) => {
    if (node.type === "Raw") reject("unsupported CSS syntax")
    if (node.type === "Atrule" && ident.decode(node.name).toLowerCase() !== "media") {
      reject("only CSS @media rules are supported")
    }
    if (node.type === "Function" && !cssFunctions.has(ident.decode(node.name).toLowerCase())) {
      reject("unsupported CSS function")
    }
    if (
      node.type === "Url" &&
      (!node.value.startsWith("#") || !definitionId.test(node.value.slice(1)))
    ) {
      reject("only local fragment references are supported")
    }
    if (
      node.type === "Declaration" &&
      /^(?:-\w+-)?(?:animation|transition)(?:-|$)/i.test(ident.decode(node.property))
    ) {
      reject("animation is not supported")
    }
  })
}

export function inspectStaticSvg(source: string): { width: number; height: number } {
  if (new TextEncoder().encode(source).byteLength > MAX_SVG_BYTES) reject("file exceeds 128 KiB")
  const parser = new SaxesParser({ xmlns: true })
  let dimensions: { width: number; height: number } | undefined
  let depth = 0
  let count = 0
  let stylesheet: string | undefined
  parser.on("error", () => reject("malformed XML"))
  parser.on("doctype", () => reject("DOCTYPE is not supported"))
  parser.on("processinginstruction", () => reject("processing instructions are not supported"))
  parser.on("opentag", (tag) => {
    if (++depth > 64 || ++count > 4096) reject("drawing is too complex")
    if (tag.uri !== SVG_NAMESPACE || !elements.has(tag.local) || stylesheet !== undefined) {
      reject("unsupported SVG element")
    }
    if (depth === 1) {
      if (tag.local !== "svg") reject("root element must be SVG")
      const parts = tag.attributes.viewBox?.value.trim().split(/\s*,\s*|\s+/) ?? []
      const numbers = parts.map(Number)
      if (
        parts.length !== 4 ||
        parts.some((part) => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(part)) ||
        numbers.some((value) => !Number.isFinite(value) || Math.abs(value) > 32768) ||
        numbers[2] <= 0 ||
        numbers[3] <= 0
      ) {
        reject("viewBox must contain four finite numbers and fit within 32768 SVG units")
      }
      dimensions = { width: numbers[2], height: numbers[3] }
    }
    if (tag.local === "style") stylesheet = ""
    for (const attr of Object.values(tag.attributes)) {
      if (attr.uri === xmlnsNamespace) continue
      if (attr.uri === xmlNamespace && (attr.local === "lang" || attr.local === "space")) continue
      if (attr.uri || !attributes.has(attr.local)) reject("unsupported SVG attribute")
      if (attr.local === "style") checkCss(attr.value, "declarationList")
      if (paint.has(attr.local)) checkCss(attr.value, "value")
    }
  })
  const styleText = (text: string) => {
    if (stylesheet !== undefined) stylesheet += text
  }
  parser.on("text", styleText)
  parser.on("cdata", styleText)
  parser.on("closetag", (tag) => {
    if (tag.local === "style" && stylesheet !== undefined) {
      checkCss(stylesheet, "stylesheet")
      stylesheet = undefined
    }
    depth--
  })
  parser.write(source).close()
  return dimensions ?? reject("missing SVG root")
}
