export const MAX_MERMAID_BYTES = 32 * 1024

export const MERMAID_RENDERERS = {
  flowchart: "flowchart-v2",
  graph: "flowchart-v2",
  sequenceDiagram: "sequence",
  classDiagram: "classDiagram",
  stateDiagram: "stateDiagram",
  "stateDiagram-v2": "stateDiagram",
  erDiagram: "er",
  journey: "journey",
  gantt: "gantt",
  pie: "pie",
  gitGraph: "gitGraph",
  requirementDiagram: "requirement",
  timeline: "timeline",
  quadrantChart: "quadrantChart",
  kanban: "kanban",
  block: "block",
  packet: "packet",
  sankey: "sankey",
  xychart: "xychart",
  C4Context: "c4",
  C4Container: "c4",
  C4Component: "c4",
  C4Dynamic: "c4",
  C4Deployment: "c4",
} as const

type MermaidRenderer = (typeof MERMAID_RENDERERS)[keyof typeof MERMAID_RENDERERS]

const styleStatement = /(?:^|[;\r\n{}])\s*(?:classDef|linkStyle|style)[ \t]+([^;\r\n]+)/gi
const styleTarget = /^[\w.-]+(?:\s*,\s*[\w.-]+)*[ \t]+(?=[\w-]+\s*:)/
const safeStyle = /^(?:[\w\s%#.,:+!-]|\\,|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\))*$/i

/** Shared by storage and browser before Mermaid can parse or load resources. */
export function assertMermaidPolicy(source: string): MermaidRenderer {
  if (new TextEncoder().encode(source).byteLength > MAX_MERMAID_BYTES) {
    throw new Error(`Mermaid source exceeds ${MAX_MERMAID_BYTES} bytes`)
  }
  if (/^\s*---|%%\s*\{/m.test(source)) {
    throw new Error(
      "Mermaid configuration is not permitted: frontmatter and directives are not supported",
    )
  }
  const definition = source.replace(/^(?:\s*%%[^\r\n]*(?:\r\n?|\n|$))*/, "").trimStart()
  const header = /^[^\s;]+/.exec(definition)?.[0]
  if (!header || !Object.hasOwn(MERMAID_RENDERERS, header)) {
    throw new Error("Mermaid diagram type is not supported")
  }
  const renderer = MERMAID_RENDERERS[header as keyof typeof MERMAID_RENDERERS]
  if (/@\s*\{/.test(source) || /!\s*\[/.test(source)) {
    throw new Error("Mermaid node metadata and image labels are not supported")
  }
  if (
    /(?:^|[;\r\n{}])\s*click\b/i.test(source) ||
    (renderer === "sequence" &&
      /(?:^|[;\r\n])\s*(?:links?|properties|details)\s+\S/i.test(source)) ||
    (renderer === "classDiagram" && /(?:^|[;\r\n{}])\s*link\s+\S/i.test(source)) ||
    (renderer === "c4" &&
      /\$(?:link|sprite|legendSprite)\s*=|\b(?:UpdateElementStyle|UpdateRelStyle)\s*\(/i.test(
        source,
      )) ||
    /<\/?[a-z!][^>]*>/i.test(source) ||
    /\b(?:https?|data|javascript|file|ftp):/i.test(source) ||
    /\b(?:url|(?:-webkit-)?image-set|image|src)\s*\(|@(?:import|font-face)\b/i.test(source) ||
    /\b(?:image|icon|img|href)\s*:/i.test(source) ||
    /\b(?:fa|fab|fas|iconify):/i.test(source)
  ) {
    throw new Error("HTML, click actions, external resources, images and icons are not supported")
  }
  for (const [, statement] of source.matchAll(styleStatement)) {
    const declaration = statement.split("%%", 1)[0]
    if (!declaration.includes(":")) continue
    const target = styleTarget.exec(declaration)
    if (!target || !safeStyle.test(declaration.slice(target[0].length))) {
      throw new Error("Only simple Mermaid style declarations are supported")
    }
  }
  return renderer
}

export function assertMermaidFocus(renderer: MermaidRenderer, focusNodes?: readonly string[]) {
  if (focusNodes && renderer !== "flowchart-v2") {
    throw new Error("Focus nodes are only supported for flowchart diagrams")
  }
}
