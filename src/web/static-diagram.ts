import { inspectStaticSvg, SVG_NAMESPACE } from "../static-svg.js"

export function openStaticDiagram(source: string, title: string) {
  const { width, height } = inspectStaticSvg(source)
  const svg = document.createElementNS(SVG_NAMESPACE, "svg")
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
  svg.setAttribute("role", "img")
  svg.setAttribute("aria-label", title)
  const picture = document.createElementNS(SVG_NAMESPACE, "image")
  picture.setAttribute("width", String(width))
  picture.setAttribute("height", String(height))
  svg.append(picture)

  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }))
  const probe = new Image()
  probe.src = url
  return {
    loaded: probe.decode().then(() => {
      picture.setAttribute("href", url)
      return svg
    }),
    close: () => URL.revokeObjectURL(url),
  }
}
