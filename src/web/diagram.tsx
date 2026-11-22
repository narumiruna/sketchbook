import mermaid, { type MermaidConfig } from "mermaid"
import { type RefObject, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { assertMermaidFocus, assertMermaidPolicy } from "../mermaid-policy.js"
import { DiagramControl } from "./diagram-controls"
import { sanitizeDiagramSvg } from "./diagram-svg"
import { createDiagramView, initialDiagramViewState } from "./diagram-view"

const renderConfig = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    primaryColor: "#e5edf6",
    primaryBorderColor: "#607b98",
    primaryTextColor: "#243447",
    titleColor: "#243447",
    clusterBkg: "#f5f7fa",
    clusterBorder: "#788796",
    lineColor: "#53667b",
    arrowheadColor: "#53667b",
    edgeLabelBackground: "#eef2f7",
  },
  fontFamily: "system-ui, sans-serif",
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  dompurifyConfig: { ALLOWED_TAGS: ["br", "b", "em", "i", "strong"], ALLOWED_ATTR: [] },
  suppressErrorRendering: true,
} satisfies MermaidConfig

function checkSource(source: string) {
  try {
    return { renderer: assertMermaidPolicy(source), error: null }
  } catch (error) {
    return { renderer: null, error: error instanceof Error ? error.message : String(error) }
  }
}

let queue: Promise<unknown> = Promise.resolve()
let nextId = 0

type Format = "mermaid" | "svg"

interface Props {
  source: string
  format: Format
  title: string
  blockId: string
  slideId: string
  focusNodes?: readonly string[]
}

type Result = ({ source: string } & ({ format: "mermaid" } | { format: "svg"; title: string })) &
  ({ svg: SVGSVGElement } | { error: string })

type FrameMode = "native" | "fallback" | null

function useDiagramFullscreen(
  source: string,
  format: Format,
  card: RefObject<HTMLElement | null>,
  viewport: RefObject<HTMLElement | null>,
) {
  const service = useRef<{ toggle: () => Promise<void> } | null>(null)
  const pendingRequest = useRef(false)
  const [pending, setPending] = useState(false)
  const [mode, setMode] = useState<FrameMode>(null)
  const [status, setStatus] = useState("")

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new source closes the previous fullscreen session.
  useEffect(() => {
    const element = card.current
    if (!element) return
    let alive = true
    let fallback = false
    let requested = false
    let opener: HTMLElement | null = null
    let observer: MutationObserver | undefined
    const isolated = new Map<HTMLElement, boolean>()
    const locks: { element: HTMLElement; overflow: string; priority: string }[] = []
    setMode(null)
    setStatus("")
    setPending(pendingRequest.current)

    const restoreFocus = () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
      opener = null
    }
    const restoreFallback = () => {
      observer?.disconnect()
      observer = undefined
      for (const [sibling, inert] of isolated) sibling.inert = inert
      isolated.clear()
      for (const lock of locks) {
        if (lock.overflow) lock.element.style.setProperty("overflow", lock.overflow, lock.priority)
        else lock.element.style.removeProperty("overflow")
      }
      locks.length = 0
      fallback = false
    }
    const closeFallback = () => {
      if (!fallback) return false
      restoreFallback()
      setMode(null)
      restoreFocus()
      return true
    }
    const focusable = () =>
      [...element.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']")].filter(
        (node) => !node.closest("[hidden], [inert]") && node.getClientRects().length > 0,
      )
    const focusFrame = () => {
      const view = viewport.current
      const target = view && !view.hidden ? view : (focusable()[0] ?? element)
      target.focus({ preventScroll: true })
    }
    const isolate = () => {
      let current: HTMLElement = element
      while (current.parentElement) {
        for (const sibling of current.parentElement.children) {
          if (sibling === current || !(sibling instanceof HTMLElement) || isolated.has(sibling))
            continue
          isolated.set(sibling, sibling.inert)
          sibling.inert = true
        }
        current = current.parentElement
      }
    }
    const openFallback = () => {
      if (!alive || fallback) return
      fallback = true
      isolate()
      observer = new MutationObserver(isolate)
      observer.observe(document.body, { childList: true, subtree: true })
      const containers = new Set([document.documentElement, document.body])
      let current = element.parentElement
      while (current) {
        const style = getComputedStyle(current)
        if (/(auto|scroll|overlay)/.test(`${style.overflow} ${style.overflowY}`))
          containers.add(current)
        current = current.parentElement
      }
      for (const container of containers) {
        locks.push({
          element: container,
          overflow: container.style.getPropertyValue("overflow"),
          priority: container.style.getPropertyPriority("overflow"),
        })
        container.style.setProperty("overflow", "hidden")
      }
      setMode("fallback")
    }
    const keydown = (event: KeyboardEvent) => {
      if (!fallback) return
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        closeFallback()
      } else if (event.key === "Tab") {
        const targets = focusable()
        const index = targets.indexOf(document.activeElement as HTMLElement)
        const next = event.shiftKey ? index - 1 : index + 1
        if (index < 0 || next < 0 || next >= targets.length) {
          event.preventDefault()
          ;(event.shiftKey ? targets.at(-1) : targets[0])?.focus({ preventScroll: true })
        }
      }
    }
    const focusin = (event: FocusEvent) => {
      if (fallback && event.target instanceof Node && !element.contains(event.target)) focusFrame()
    }
    const fullscreenchange = () => {
      if (document.fullscreenElement === element) {
        if (requested) setMode("native")
      } else if (requested) {
        requested = false
        setMode(null)
        restoreFocus()
      }
    }
    const toggle = async () => {
      if (!alive || pendingRequest.current) return
      if (closeFallback()) return
      if (document.fullscreenElement === element) {
        try {
          await document.exitFullscreen()
        } catch {
          if (alive) setStatus("Unable to exit fullscreen.")
        }
        return
      }
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setStatus("")
      pendingRequest.current = true
      setPending(true)
      requested = true
      try {
        if (typeof element.requestFullscreen !== "function") throw new Error("Unavailable")
        await element.requestFullscreen()
        if (!alive) {
          if (document.fullscreenElement === element)
            await document.exitFullscreen().catch(() => {})
        } else if (document.fullscreenElement === element) setMode("native")
      } catch {
        if (alive) {
          requested = false
          openFallback()
        }
      } finally {
        pendingRequest.current = false
        if (service.current) setPending(false)
      }
    }
    service.current = { toggle }
    document.addEventListener("fullscreenchange", fullscreenchange)
    document.addEventListener("keydown", keydown, true)
    document.addEventListener("focusin", focusin)
    return () => {
      alive = false
      service.current = null
      document.removeEventListener("fullscreenchange", fullscreenchange)
      document.removeEventListener("keydown", keydown, true)
      document.removeEventListener("focusin", focusin)
      restoreFallback()
      restoreFocus()
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {})
    }
  }, [source, format, card, viewport])

  useEffect(() => {
    if (!mode) return
    const target = viewport.current
    if (target && !target.hidden) target.focus({ preventScroll: true })
    else card.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
  }, [mode, card, viewport])

  return { mode, pending, status, toggle: () => void service.current?.toggle() }
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => window.matchMedia("(pointer: coarse)").matches)
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)")
    const update = () => setCoarse(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return coarse
}

export function Diagram({ source, format, title, blockId, slideId, focusNodes }: Props) {
  const card = useRef<HTMLElement>(null)
  const viewport = useRef<HTMLElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<ReturnType<typeof createDiagramView> | null>(null)
  const generation = useRef(0)
  const sourceId = useId()
  const helpId = useId()
  const controls = useRef<HTMLFieldSetElement>(null)
  const sourceToggle = useRef<HTMLButtonElement>(null)
  const coarsePointer = useCoarsePointer()
  const [result, setResult] = useState<Result | null>(null)
  const [view, setView] = useState(initialDiagramViewState)
  const [showSource, setShowSource] = useState(false)
  const fullscreen = useDiagramFullscreen(source, format, card, viewport)
  const { renderer, error: sourceError } = useMemo(
    () => (format === "mermaid" ? checkSource(source) : { renderer: null, error: null }),
    [source, format],
  )
  let policyError = sourceError
  if (renderer) {
    try {
      assertMermaidFocus(renderer, focusNodes)
    } catch (error) {
      policyError = error instanceof Error ? error.message : String(error)
    }
  }

  useLayoutEffect(() => {
    if (!viewport.current || !host.current) return
    const next = createDiagramView(viewport.current, host.current, { onChange: setView })
    controller.current = next
    return () => {
      controller.current = null
      next.destroy()
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new slide or source starts with the diagram visible.
  useLayoutEffect(() => {
    if (
      controls.current?.contains(document.activeElement) &&
      document.activeElement?.matches("button:disabled")
    ) {
      sourceToggle.current?.focus({ preventScroll: true })
    }
    setShowSource(false)
  }, [source, format, slideId])

  useEffect(() => {
    if (format !== "svg") return
    let cancelled = false
    let close: (() => void) | undefined
    void (async () => {
      try {
        const { openStaticDiagram } = await import("./static-diagram")
        if (cancelled) return
        const image = openStaticDiagram(source, title)
        close = image.close
        const svg = await image.loaded
        if (!cancelled) setResult({ source, format, title, svg })
      } catch (error) {
        close?.()
        close = undefined
        if (!cancelled)
          setResult({
            source,
            format,
            title,
            error: error instanceof Error ? error.message : String(error),
          })
      }
    })()
    return () => {
      cancelled = true
      close?.()
      close = undefined
    }
  }, [source, format, title])

  useEffect(() => {
    if (!renderer || policyError) return
    const current = ++generation.current
    const id = `sketchbook-diagram-${++nextId}`
    let cancelled = false
    const render = async () => {
      if (cancelled) return
      const staging = document.createElement("div")
      try {
        mermaid.initialize({
          ...renderConfig,
          ...(renderer === "flowchart-v2" ? { look: "handDrawn", handDrawnSeed: 42 } : {}),
        })
        if (mermaid.detectType(source) !== renderer) {
          throw new Error("Mermaid diagram source does not match its supported header")
        }
        staging.inert = true
        staging.style.cssText = "position: fixed; left: -10000px; width: 100%; visibility: hidden"
        document.body.append(staging)
        const rendered = await mermaid.render(id, source, staging)
        const svg = sanitizeDiagramSvg(rendered.svg, id)
        if (!cancelled && generation.current === current)
          setResult({ source, format: "mermaid", svg })
      } catch (error) {
        if (!cancelled && generation.current === current) {
          setResult({
            source,
            format: "mermaid",
            error: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        staging.remove()
      }
    }
    queue = queue.then(render, render)
    return () => {
      cancelled = true
      generation.current++
    }
  }, [source, renderer, policyError])

  const active = policyError
    ? { error: policyError }
    : result?.source === source &&
        result.format === format &&
        (result.format !== "svg" || result.title === title)
      ? result
      : null
  const graphic = active && "svg" in active ? active.svg : null

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    if (graphic) {
      element.replaceChildren(graphic)
    } else {
      element.replaceChildren()
    }
    controller.current?.refresh()
  }, [graphic])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Apply the camera when entering any slide, including one sharing the same SVG.
  useLayoutEffect(() => {
    controller.current?.setFocusNodes(focusNodes)
  }, [slideId, focusNodes])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh after visibility or fullscreen geometry changes.
  useLayoutEffect(() => {
    controller.current?.refresh()
  }, [showSource, fullscreen.mode])

  const error = active && "error" in active ? active.error : null
  const ready = !!active && "svg" in active && view.ready
  const disabled = !ready || showSource
  const expanded = fullscreen.mode !== null
  const pointerHelp = coarsePointer
    ? expanded
      ? "Use the controls to zoom. Exit fullscreen to scroll the article."
      : "Use the controls to zoom. Swipe to scroll the article."
    : "Drag with a mouse or pen to pan. Use Ctrl or Command + wheel to zoom."
  const cameraHelp =
    "With the diagram focused, use plus or minus to zoom, zero to fit, and Shift + arrow keys to pan."
  const focusHelp =
    ready && focusNodes && view.focus === "ready"
      ? " The hatched frame marks this slide’s focus. Fit to screen shows the whole diagram."
      : ""
  const help = `${pointerHelp} ${cameraHelp}${focusHelp}`
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-modal is set only when the frame has the dialog role.
    <section
      ref={card}
      className={`diagram${fullscreen.mode === "fallback" ? " diagram-expanded" : ""}`}
      aria-label={`Diagram for slide ${slideId}`}
      aria-busy={!active}
      role={fullscreen.mode === "fallback" ? "dialog" : undefined}
      aria-modal={fullscreen.mode === "fallback" ? true : undefined}
      tabIndex={fullscreen.mode === "fallback" ? -1 : undefined}
    >
      <fieldset ref={controls} className="diagram-controls" aria-label="Diagram controls">
        <DiagramControl
          label="Fit to screen"
          icon="fit"
          disabled={disabled}
          onClick={() => controller.current?.fit()}
        />
        <DiagramControl
          label={expanded ? "Exit fullscreen" : "Fullscreen"}
          icon={expanded ? "collapse" : "expand"}
          disabled={fullscreen.pending}
          onClick={fullscreen.toggle}
        />
        <DiagramControl
          label="Zoom out"
          icon="minus"
          disabled={disabled || view.scale <= view.minScale}
          onClick={() => controller.current?.zoomBy(0.8)}
        />
        <output aria-label="Current zoom">
          {ready ? `${Math.round(view.scale * 100)}%` : "—"}
        </output>
        <DiagramControl
          label="Zoom in"
          icon="plus"
          disabled={disabled || view.scale >= view.maxScale}
          onClick={() => controller.current?.zoomBy(1.25)}
        />
        <DiagramControl
          label={focusNodes && view.focus === "ready" ? "Reset to slide focus" : "Reset zoom"}
          icon="reset"
          disabled={disabled}
          onClick={() => controller.current?.reset()}
        />
        <DiagramControl
          ref={sourceToggle}
          label={showSource ? "Show diagram" : "Show source"}
          icon={showSource ? "diagram" : "source"}
          aria-controls={sourceId}
          aria-pressed={showSource}
          onClick={() => setShowSource((visible) => !visible)}
        />
        <p id={helpId} className="diagram-pan-hint">
          {help}
        </p>
      </fieldset>
      <section
        ref={viewport}
        className="diagram-viewport"
        hidden={showSource || error !== null}
        aria-label="Interactive diagram"
        aria-describedby={helpId}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus enables diagram-local camera controls.
        tabIndex={0}
      >
        <div ref={host} className="diagram-svg" />
        {!active && <p role="status">Rendering diagram…</p>}
      </section>
      {error !== null && (
        <div role="alert" className="render-error">
          <p>
            Block {blockId}, slide {slideId}: {error}
          </p>
        </div>
      )}
      {(showSource || error !== null) && (
        // biome-ignore lint/a11y/useSemanticElements: Preserve preformatted source while naming its scroll region.
        <pre
          id={sourceId}
          className="diagram-source"
          role="region"
          aria-label="Diagram source"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus enables native keyboard scrolling of the source.
          tabIndex={0}
          onKeyDown={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
                " ",
              ].includes(event.key)
            ) {
              event.stopPropagation()
            }
          }}
        >
          <code>{source}</code>
        </pre>
      )}
      {ready && focusNodes && view.focus === "missing" && (
        <p className="diagram-pan-hint" role="status">
          Could not find the slide’s focus region. Showing the whole diagram.
        </p>
      )}
      {fullscreen.status && <p role="status">{fullscreen.status}</p>}
    </section>
  )
}
