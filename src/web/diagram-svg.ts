import DOMPurify from "dompurify"

const svgNamespace = "http://www.w3.org/2000/svg"
const definitionTags = "marker, clipPath, mask, filter, pattern, linearGradient, radialGradient"
const presentationAttributes = new Set([
  "clip-path",
  "cursor",
  "fill",
  "filter",
  "marker",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke",
])
const safeFunctions = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "color",
  "color-mix",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "calc",
  "min",
  "max",
  "clamp",
  "matrix",
  "scale",
  "translate",
  "rotate",
  "skewx",
  "skewy",
])

const localUrl = /url\(\s*(["']?)#([\w:.-]+)\1\s*\)/gi

function localValue(value: string, definitions: ReadonlyMap<string, string>) {
  if (value.includes("\\")) return null
  const withoutUrls = value.replace(localUrl, (url, _quote, target: string) =>
    definitions.has(target) ? "" : url,
  )
  for (const [, name] of withoutUrls.matchAll(/([\w-]+)\s*\(/g)) {
    if (!safeFunctions.has(name.toLowerCase())) return null
  }
  return value.replace(
    localUrl,
    (_url, _quote, target: string) => `url(#${definitions.get(target)})`,
  )
}

function cleanDeclarations(style: CSSStyleDeclaration, definitions: ReadonlyMap<string, string>) {
  for (const property of Array.from(style)) {
    const oldValue = style.getPropertyValue(property)
    const value = localValue(oldValue, definitions)
    if (property.startsWith("--") || value === null) {
      style.removeProperty(property)
    } else if (value !== oldValue) {
      style.setProperty(property, value, style.getPropertyPriority(property))
    }
  }
  return style.cssText
}

export function sanitizeDiagramSvg(markup: string, id: string): SVGSVGElement {
  const clean = DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      "foreignObject",
      "image",
      "feImage",
      "a",
      "script",
      "animate",
      "animateMotion",
      "animateTransform",
      "set",
    ],
    FORBID_ATTR: ["href", "xlink:href", "src", "xml:base"],
  })
  const parsed = new DOMParser().parseFromString(clean, "image/svg+xml")
  const svg = parsed.documentElement
  if (svg.localName !== "svg" || svg.namespaceURI !== svgNamespace || svg.id !== id) {
    throw new Error("Invalid sanitized diagram SVG")
  }
  const definitions = new Map<string, string>()
  for (const [index, node] of [
    ...svg.querySelectorAll(`defs :is(${definitionTags})[id]`),
  ].entries()) {
    const original = node.id
    const suffix = /^[\w:.-]+$/.test(original) ? `-${original}` : ""
    node.id = `${id}-definition-${index}${suffix}`
    if (!definitions.has(original)) definitions.set(original, node.id)
  }
  const scope = `:where(#${CSS.escape(id)}, #${CSS.escape(id)} *)`
  for (const style of svg.querySelectorAll("style")) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(style.textContent ?? "")
    style.textContent = Array.from(sheet.cssRules)
      .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
      .map(
        (rule) =>
          `${scope}:is(${rule.selectorText}) { ${cleanDeclarations(rule.style, definitions)} }`,
      )
      .join("\n")
  }
  for (const node of [svg, ...svg.querySelectorAll("*")]) {
    const element = node as SVGElement
    if (element.hasAttribute("style")) cleanDeclarations(element.style, definitions)
    for (const { name, value } of Array.from(element.attributes)) {
      if (!presentationAttributes.has(name)) continue
      const safe = localValue(value, definitions)
      if (safe === null) element.removeAttribute(name)
      else if (safe !== value) element.setAttribute(name, safe)
    }
  }
  return svg as unknown as SVGSVGElement
}
