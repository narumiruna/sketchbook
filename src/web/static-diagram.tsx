import { useEffect, useState } from "react"
import { inspectStaticSvg } from "../static-svg.js"

interface Artwork {
  url: string
  width: number
  height: number
}

export function StaticDiagram({ source, title }: { source: string; title: string }) {
  const [result, setResult] = useState<Artwork | string>()
  useEffect(() => {
    let url: string | undefined
    try {
      const size = inspectStaticSvg(source)
      url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }))
      setResult({ url, ...size })
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error))
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [source])

  if (typeof result === "string")
    return (
      <p role="alert" className="render-error">
        {result}
      </p>
    )
  if (!result) return <p role="status">Loading diagram…</p>
  return (
    <section
      className="static-diagram"
      data-static-figure=""
      aria-label="Scrollable drawing"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus enables native keyboard scrolling.
      tabIndex={0}
    >
      <img
        alt={title}
        src={result.url}
        width={Math.ceil(result.width)}
        height={Math.ceil(result.height)}
        onError={() => {
          URL.revokeObjectURL(result.url)
          setResult("Could not display the SVG diagram.")
        }}
      />
    </section>
  )
}
