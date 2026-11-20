import {
  type DiagramViewController as Camera,
  createDiagramView as createCamera,
  maxDiagramScale,
  minDiagramScale,
} from "@narumitw/diagram-viewer/core"
import { measureDiagramFocus } from "./diagram-focus.js"

// Match the padding on .diagram-viewport. The core reads it from CSS.
const inset = 16
const contentHeightProperty = "--diagram-content-height"
const viewportControlSelector =
  'input, select, textarea, button, a[href], label, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]'

/** Camera state used by Sketchbook's controls and slide focus hints. */
export interface DiagramViewState {
  scale: number
  minScale: number
  maxScale: number
  ready: boolean
  cropped: boolean
  focus?: "ready" | "missing"
}

/** Host actions for the mounted diagram in the current slide. */
export interface DiagramViewController {
  fit(): void
  reset(): void
  zoomBy(factor: number): void
  refresh(reset?: boolean): void
  setFocusNodes(ids?: readonly string[]): void
  destroy(): void
}

/** Keeps the camera controls disabled while the first SVG is rendering. */
export const initialDiagramViewState: DiagramViewState = {
  scale: 1,
  minScale: minDiagramScale,
  maxScale: maxDiagramScale,
  ready: false,
  cropped: false,
}

/** Mounts the shared camera without taking ownership of Sketchbook's SVG or viewport height. */
export function createDiagramView(
  viewport: HTMLElement,
  stage: HTMLElement,
  options: { onChange: (state: DiagramViewState) => void },
): DiagramViewController {
  let camera: Camera | undefined
  let diagram: SVGSVGElement | undefined
  let naturalWidth = 0
  let naturalHeight = 0
  let contentHeight: string | undefined
  let focusNodes: readonly string[] | undefined
  let focus: DiagramViewState["focus"]
  let frame: HTMLElement | undefined
  let pendingCamera = true
  let ready = false
  let laidOut = false
  let { scale, minScale, maxScale, cropped } = initialDiagramViewState
  let reported: DiagramViewState | undefined

  function report(): void {
    const next = {
      scale,
      minScale,
      maxScale,
      ready,
      cropped: ready && cropped,
      ...(focus && { focus }),
    }
    if (
      reported?.scale === next.scale &&
      reported.minScale === next.minScale &&
      reported.maxScale === next.maxScale &&
      reported.ready === next.ready &&
      reported.cropped === next.cropped &&
      reported.focus === next.focus
    )
      return
    reported = next
    options.onChange({ ...next })
  }

  function updateInlineHeight(): void {
    const width = viewport.clientWidth - inset * 2
    // CSS bounds the natural, width-fitted height. Do not feed zoom or the
    // observed height back into this calculation.
    const height =
      diagram && width > 0
        ? `${naturalHeight * Math.min(1, width / naturalWidth) + inset * 2}px`
        : undefined
    if (height === contentHeight) return
    contentHeight = height
    if (height) viewport.style.setProperty(contentHeightProperty, height)
    else viewport.style.removeProperty(contentHeightProperty)
  }

  function isInteractionEnabled(): boolean {
    return ready && stage.firstElementChild === diagram
  }

  function onWheel(event: WheelEvent): void {
    // Override only the zoom-out step in diagram-viewer 0.4.0. Leave zoom-in
    // and unmodified scrolling to the core and the browser, respectively.
    if (
      !camera ||
      event.defaultPrevented ||
      (!event.ctrlKey && !event.metaKey) ||
      !Number.isFinite(event.deltaY) ||
      event.deltaY <= 0 ||
      !isInteractionEnabled() ||
      viewport.hidden ||
      stage.hidden ||
      !viewport.isConnected ||
      !stage.isConnected ||
      viewport.clientWidth <= inset * 2 ||
      viewport.clientHeight <= inset * 2
    ) {
      return
    }
    const target =
      event.target instanceof Element ? event.target.closest(viewportControlSelector) : null
    if (target && target !== viewport && viewport.contains(target)) return
    const { display, visibility } = getComputedStyle(stage)
    if (display === "none" || visibility === "hidden" || visibility === "collapse") return

    // The core skips canceled events. For non-cancelable wheel events, stop
    // dispatch here so the other listener cannot apply a second zoom step.
    if (event.cancelable) event.preventDefault()
    else event.stopImmediatePropagation()
    camera.zoomBy(1 / 1.1, { x: event.clientX, y: event.clientY })
  }

  function refresh(reset = false): void {
    if (!camera) return
    const next = stage.querySelector<SVGSVGElement>(":scope > svg")
    const { width = 0, height = 0 } = next?.viewBox.baseVal ?? {}
    const valid = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    if (
      diagram !== (valid ? next : undefined) ||
      naturalWidth !== width ||
      naturalHeight !== height
    ) {
      diagram = valid ? (next ?? undefined) : undefined
      naturalWidth = width
      naturalHeight = height
      reset = true
    }
    if (reset) {
      ready = false
      pendingCamera = true
      focus = undefined
      frame?.remove()
      frame = undefined
    }
    updateInlineHeight()
    laidOut = false
    camera.refresh()
    if (!laidOut) {
      ready = false
      if (pendingCamera) camera.setFocusRegion(undefined)
    }
    report()
  }

  // Schedule the host's layout pass before the core's observer schedules its
  // fit. Use an animation frame so height writes do not reenter resize delivery.
  let resizeFrame: number | undefined
  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          if (resizeFrame !== undefined) return
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = undefined
            refresh()
          })
        })
      : undefined
  resizeObserver?.observe(viewport)
  viewport.addEventListener("wheel", onWheel, { passive: false })

  camera = createCamera(viewport, stage, {
    manageInlineHeight: false,
    resetMode: "native",
    focusMaxScale: 2,
    getKeyboardPan: () => "shift-arrows",
    isKeyboardEnabled: () => viewport.ownerDocument.activeElement === viewport,
    isInteractionEnabled,
    onScaleChange(value, minimum, maximum) {
      if (!diagram) return
      scale = value
      minScale = minimum
      maxScale = maximum
    },
    onCropChange(value) {
      if (!camera || !diagram) return
      laidOut = true
      cropped = value
      ready = true
      if (pendingCamera) {
        // Clear this before setting the region or mode; those publish again.
        pendingCamera = false
        const region = focusNodes && measureDiagramFocus(diagram, focusNodes)
        focus = region ? "ready" : focusNodes ? "missing" : undefined
        if (region) {
          frame = stage.ownerDocument.createElement("div")
          frame.className = "diagram-focus-frame"
          frame.setAttribute("aria-hidden", "true")
          stage.append(frame)
        }
        camera.setFocusRegion(region ?? undefined)
        // The region can compare equal when two slides focus the same nodes.
        camera.setCameraMode(region ? "focus" : "overview")
      }
      report()
    },
  })
  refresh()

  return {
    fit() {
      if (!viewport.hidden && isInteractionEnabled()) camera?.setCameraMode("overview")
    },
    reset() {
      if (isInteractionEnabled()) camera?.reset()
    },
    zoomBy(factor) {
      if (isInteractionEnabled()) camera?.zoomBy(factor)
    },
    refresh,
    setFocusNodes(ids) {
      focusNodes = ids
      refresh(true)
    },
    destroy() {
      if (!camera) return
      resizeObserver?.disconnect()
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
      viewport.removeEventListener("wheel", onWheel)
      ready = false
      camera.destroy()
      camera = undefined
      frame?.remove()
      viewport.style.removeProperty(contentHeightProperty)
    },
  }
}
