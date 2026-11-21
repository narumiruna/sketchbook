export interface DiagramRegion {
  x: number
  y: number
  width: number
  height: number
}

/** Measures rendered Mermaid node groups in the stage's unscaled coordinates. */
export function measureDiagramFocus(
  diagram: SVGSVGElement,
  ids: readonly string[],
): DiagramRegion | null {
  const nodes = new Map<string, SVGGElement>()
  for (const node of diagram.querySelectorAll<SVGGElement>("g.nodes > g[id]")) {
    const id = node.id.match(/(?:^|-)flowchart-(.+)-\d+$/)?.[1]
    if (id) nodes.set(id, node)
  }

  const graph = diagram.getBoundingClientRect()
  const { width, height } = diagram.viewBox.baseVal
  if (graph.width <= 0 || graph.height <= 0) return null
  let left = width
  let top = height
  let right = 0
  let bottom = 0
  for (const id of ids) {
    const box = nodes.get(id)?.getBoundingClientRect()
    if (!box || box.width <= 0 || box.height <= 0) return null
    left = Math.min(left, ((box.left - graph.left) * width) / graph.width)
    top = Math.min(top, ((box.top - graph.top) * height) / graph.height)
    right = Math.max(right, ((box.right - graph.left) * width) / graph.width)
    bottom = Math.max(bottom, ((box.bottom - graph.top) * height) / graph.height)
  }
  const padding = 12
  const x = Math.max(1, left - padding)
  const y = Math.max(1, top - padding)
  const w = Math.min(width - 1, right + padding) - x
  const h = Math.min(height - 1, bottom + padding) - y
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null
}
