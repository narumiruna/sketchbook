import DOMPurify from "dompurify"
import mermaid from "mermaid"
import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { assertMermaidPolicy } from "../mermaid-policy.js"
import { DiagramControl } from "./diagram-controls"
import { createDiagramView } from "./diagram-view"

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  look: "handDrawn",
  handDrawnSeed: 42,
  theme: "default",
  fontFamily: "system-ui, sans-serif",
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  suppressErrorRendering: true,
})

// Mermaid has shared mutable state. Serialize all renders, including those from
// different decks. Failed renders must not stop the queue.
let queue: Promise<unknown> = Promise.resolve()
let nextId = 0

function sanitizeSvg(svg: string) {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "image", "a", "script"],
    FORBID_ATTR: ["href", "xlink:href"],
  })
  const parsed = new DOMParser().parseFromString(clean, "image/svg+xml")
  if (parsed.documentElement.localName !== "svg") throw new Error("Invalid sanitized diagram SVG")
  // DOMPurify does not sanitize CSS. Only local fragment URLs are needed for
  // Mermaid markers and clip paths. Drop imports and every other CSS URL.
  const localCss = (css: string) =>
    css
      .replace(/@import[^;{}]*(?:;|$)/gi, "")
      .replace(
        /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
        (
          _match,
          double: string | undefined,
          single: string | undefined,
          bare: string | undefined,
        ) => {
          const value = (double ?? single ?? bare ?? "").trim()
          return /^#[\w:.-]+$/.test(value) ? `url(${value})` : "none"
        },
      )
  for (const style of parsed.querySelectorAll("style")) {
    style.textContent = localCss(style.textContent ?? "")
  }
  for (const node of parsed.querySelectorAll("*")) {
    for (const attribute of [...node.attributes]) {
      if (/url\s*\(/i.test(attribute.value) || attribute.name === "style") {
        node.setAttribute(attribute.name, localCss(attribute.value))
      }
    }
  }
  return new XMLSerializer().serializeToString(parsed.documentElement)
}

interface Props {
  source: string
  blockId: string
  slideId: string
}

type Result = { source: string; svg: string } | { source: string; error: string }

type FrameMode = "native" | "fallback" | null

// Keep one frame in the DOM. The fallback isolates its siblings instead of
// copying SVG nodes, which would duplicate Mermaid IDs and local references.
function useDiagramFullscreen(
  source: string,
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
  }, [source, card, viewport])

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

export function Diagram({ source, blockId, slideId }: Props) {
  const card = useRef<HTMLElement>(null)
  const viewport = useRef<HTMLElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<ReturnType<typeof createDiagramView> | null>(null)
  const generation = useRef(0)
  const sourceId = useId()
  const controlsId = useId()
  const helpId = useId()
  const disclosure = useRef<HTMLButtonElement>(null)
  const secondary = useRef<HTMLFieldSetElement>(null)
  const coarsePointer = useCoarsePointer()
  const [moreControls, setMoreControls] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [view, setView] = useState({ scale: 1, minScale: 0.25, ready: false, cropped: false })
  const [showSource, setShowSource] = useState(false)
  const fullscreen = useDiagramFullscreen(source, card, viewport)

  useEffect(() => {
    if (!viewport.current || !host.current) return
    const next = createDiagramView(viewport.current, host.current, { onChange: setView })
    controller.current = next
    return () => {
      controller.current = null
      next.destroy()
    }
  }, [])

  // Restore focus and hide stale controls before the browser paints a new source.
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new source starts with the primary controls and diagram visible.
  useLayoutEffect(() => {
    if (secondary.current?.contains(document.activeElement)) {
      disclosure.current?.focus({ preventScroll: true })
    }
    setMoreControls(false)
    setShowSource(false)
  }, [source])

  useEffect(() => {
    const current = ++generation.current
    const id = `sketchbook-diagram-${++nextId}`
    let cancelled = false
    const render = async () => {
      if (cancelled) return
      try {
        // Defense in depth: never let a document override the rendering policy.
        assertMermaidPolicy(source)
        const rendered = await mermaid.render(id, source)
        const svg = sanitizeSvg(rendered.svg)
        if (!cancelled && generation.current === current) setResult({ source, svg })
      } catch (error) {
        if (!cancelled && generation.current === current) {
          setResult({ source, error: error instanceof Error ? error.message : String(error) })
        }
      }
    }
    queue = queue.then(render, render)
    return () => {
      cancelled = true
      generation.current++
    }
  }, [source])

  useEffect(() => {
    const element = host.current
    if (!element) return
    // Only sanitized SVG reaches this DOM boundary.
    if (result?.source === source && "svg" in result) {
      element.innerHTML = result.svg
      controller.current?.refresh(true)
    } else {
      element.replaceChildren()
      controller.current?.refresh(true)
    }
  }, [result, source])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh after visibility or fullscreen geometry changes.
  useEffect(() => {
    controller.current?.refresh()
  }, [showSource, moreControls, fullscreen.mode])

  const active = result?.source === source ? result : null
  const error = active && "error" in active ? active.error : null
  const ready = !!active && "svg" in active && view.ready
  const disabled = !ready || showSource
  const expanded = fullscreen.mode !== null
  const help = coarsePointer
    ? expanded
      ? "Use the controls to zoom. Exit fullscreen to scroll the article."
      : "Open More controls to zoom. Swipe to scroll the article."
    : "Drag with a mouse or pen to pan. Use Ctrl or Command + wheel to zoom. With the diagram focused, use plus or minus to zoom and zero to fit."
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
      <fieldset className="diagram-controls" aria-label="Diagram controls">
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
          ref={disclosure}
          label="More controls"
          icon="more"
          text="More controls"
          aria-expanded={moreControls}
          aria-controls={controlsId}
          onClick={() => setMoreControls((visible) => !visible)}
        />
      </fieldset>
      <fieldset
        ref={secondary}
        id={controlsId}
        className="diagram-secondary-controls"
        aria-label="More diagram controls"
        hidden={!moreControls}
      >
        <DiagramControl
          label="Zoom out"
          icon="minus"
          disabled={disabled || view.scale <= view.minScale + 1e-6}
          onClick={() => controller.current?.zoomBy(0.8)}
        />
        <output aria-label="Current zoom">
          {ready ? `${Math.round(view.scale * 100)}%` : "—"}
        </output>
        <DiagramControl
          label="Zoom in"
          icon="plus"
          disabled={disabled || view.scale >= 4 - 1e-6}
          onClick={() => controller.current?.zoomBy(1.25)}
        />
        <DiagramControl
          label="Reset zoom"
          icon="reset"
          disabled={disabled}
          onClick={() => controller.current?.reset()}
        />
        <DiagramControl
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
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus enables diagram-local zoom controls.
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
        <pre id={sourceId} className="diagram-source">
          <code>{source}</code>
        </pre>
      )}
      {fullscreen.status && <p role="status">{fullscreen.status}</p>}
    </section>
  )
}
