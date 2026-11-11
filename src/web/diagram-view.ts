const inset = 16
const maximumScale = 4

export interface DiagramViewState {
  scale: number
  minScale: number
  ready: boolean
  cropped: boolean
}

export interface DiagramViewController {
  fit(): void
  reset(): void
  zoomBy(factor: number): void
  refresh(reset?: boolean): void
  destroy(): void
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function diagramFitScale(
  viewportWidth: number,
  viewportHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): number {
  if (
    ![viewportWidth - inset * 2, viewportHeight - inset * 2, naturalWidth, naturalHeight].every(
      positive,
    )
  ) {
    return 0
  }
  return Math.min(
    1,
    (viewportWidth - inset * 2) / naturalWidth,
    (viewportHeight - inset * 2) / naturalHeight,
  )
}

export function constrainDiagramOffset(
  viewportSize: number,
  naturalSize: number,
  scale: number,
  offset: number,
): number {
  const rendered = naturalSize * scale
  return rendered <= viewportSize - inset * 2
    ? (viewportSize - rendered) / 2
    : clamp(offset, viewportSize - inset - rendered, inset)
}

export function createDiagramView(
  viewport: HTMLElement,
  stage: HTMLElement,
  options: { onChange: (state: DiagramViewState) => void },
): DiagramViewController {
  let diagram: SVGSVGElement | null = null
  let mode: "fit" | "native" | "manual" = "fit"
  let scale = 1
  let x = 0
  let y = 0
  let naturalWidth = 0
  let naturalHeight = 0
  let width = 0
  let height = 0
  let ready = false
  let initialized = false
  let pendingFit = true
  let destroyed = false
  let reported: DiagramViewState | undefined
  let pointer: { id: number; x: number; y: number } | undefined

  function visible(): boolean {
    return (
      viewport.isConnected &&
      stage.isConnected &&
      !stage.hidden &&
      !viewport.hidden &&
      stage.getClientRects().length > 0 &&
      getComputedStyle(stage).visibility === "visible" &&
      viewport.clientWidth > inset * 2 &&
      viewport.clientHeight > inset * 2
    )
  }

  function interactive(): boolean {
    return !destroyed && ready && visible() && stage.querySelector("svg") === diagram
  }

  function report(): void {
    const cropped =
      ready &&
      (naturalWidth * scale > width - inset * 2 + 0.01 ||
        naturalHeight * scale > height - inset * 2 + 0.01)
    const minScale = ready
      ? Math.min(0.25, diagramFitScale(width, height, naturalWidth, naturalHeight))
      : 0.25
    if (
      reported?.scale === scale &&
      reported.minScale === minScale &&
      reported.ready === ready &&
      reported.cropped === cropped
    )
      return
    reported = { scale, minScale, ready, cropped }
    options.onChange({ ...reported })
  }

  function apply(): void {
    x = constrainDiagramOffset(width, naturalWidth, scale, x)
    y = constrainDiagramOffset(height, naturalHeight, scale, y)
    stage.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    report()
  }

  function stopPan(): void {
    const active = pointer
    pointer = undefined
    if (!active) return
    try {
      if (viewport.hasPointerCapture(active.id)) viewport.releasePointerCapture(active.id)
    } catch {
      // The browser can release capture before a removal or cancellation callback.
    }
  }

  function refresh(reset = false): void {
    if (destroyed) return
    if (reset) pendingFit = true
    const next = stage.querySelector("svg")
    if (next !== diagram) {
      stopPan()
      diagram = next
      initialized = false
      pendingFit = true
    }
    const box = diagram?.viewBox.baseVal
    if (box && [box.width, box.height, viewport.clientWidth - inset * 2].every(positive)) {
      // Inline height depends only on natural SVG size and available width.
      // CSS bounds it and lets fullscreen fill the screen. Camera changes and
      // ResizeObserver height notifications cannot feed back into this size.
      const inlineScale = Math.min(1, (viewport.clientWidth - inset * 2) / box.width)
      viewport.style.setProperty(
        "--diagram-content-height",
        `${box.height * inlineScale + inset * 2}px`,
      )
    } else {
      viewport.style.removeProperty("--diagram-content-height")
    }
    if (!box || !positive(box.width) || !positive(box.height) || !visible()) {
      stopPan()
      ready = false
      report()
      return
    }
    if (naturalWidth !== box.width || naturalHeight !== box.height) pendingFit = true
    // Only viewport dimensions determine layout. Never measure the transformed stage.
    const worldX = initialized ? (width / 2 - x) / scale : box.width / 2
    const worldY = initialized ? (height / 2 - y) / scale : box.height / 2
    naturalWidth = box.width
    naturalHeight = box.height
    width = viewport.clientWidth
    height = viewport.clientHeight
    stage.style.width = `${naturalWidth}px`
    stage.style.height = `${naturalHeight}px`
    stage.style.transformOrigin = "0 0"
    if (pendingFit) mode = "fit"
    const fit = diagramFitScale(width, height, naturalWidth, naturalHeight)
    if (mode === "fit" || mode === "native") {
      scale = mode === "fit" ? fit : 1
      x = (width - naturalWidth * scale) / 2
      y = (height - naturalHeight * scale) / 2
    } else {
      scale = clamp(scale, Math.min(fit, 0.25), maximumScale)
      x = width / 2 - worldX * scale
      y = height / 2 - worldY * scale
    }
    pendingFit = false
    initialized = true
    ready = true
    apply()
  }

  function fitToViewport(): void {
    if (!interactive()) return
    stopPan()
    mode = "fit"
    refresh()
  }

  function reset(): void {
    if (!interactive()) return
    stopPan()
    mode = "native"
    refresh()
  }

  function zoomAt(factor: number, pointX: number, pointY: number): void {
    if (!interactive() || !positive(factor)) return
    const fit = diagramFitScale(width, height, naturalWidth, naturalHeight)
    const next = clamp(scale * factor, Math.min(fit, 0.25), maximumScale)
    x = pointX - ((pointX - x) / scale) * next
    y = pointY - ((pointY - y) / scale) * next
    scale = next
    mode = "manual"
    apply()
  }

  function zoomBy(factor: number): void {
    zoomAt(factor, width / 2, height / 2)
  }

  function onPointerDown(event: PointerEvent): void {
    if (
      !interactive() ||
      pointer ||
      event.isPrimary === false ||
      (event.pointerType !== "mouse" && event.pointerType !== "pen") ||
      event.button !== 0
    )
      return
    try {
      viewport.setPointerCapture(event.pointerId)
    } catch {
      return
    }
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
    viewport.focus({ preventScroll: true })
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointer || event.pointerId !== pointer.id) return
    if (!interactive()) {
      stopPan()
      return
    }
    x += event.clientX - pointer.x
    y += event.clientY - pointer.y
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
    mode = "manual"
    apply()
    event.preventDefault()
  }

  function onPointerEnd(event: PointerEvent): void {
    if (pointer?.id === event.pointerId) stopPan()
  }

  function onWheel(event: WheelEvent): void {
    if (
      !interactive() ||
      event.defaultPrevented ||
      (!event.ctrlKey && !event.metaKey) ||
      !Number.isFinite(event.deltaY) ||
      event.deltaY === 0
    )
      return
    const bounds = viewport.getBoundingClientRect()
    event.preventDefault()
    zoomAt(
      event.deltaY < 0 ? 1.1 : 1 / 1.1,
      event.clientX - bounds.left - viewport.clientLeft,
      event.clientY - bounds.top - viewport.clientTop,
    )
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (
      !interactive() ||
      event.defaultPrevented ||
      event.target !== viewport ||
      viewport.ownerDocument.activeElement !== viewport ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return
    switch (event.key) {
      case "+":
      case "=":
        zoomBy(1.25)
        break
      case "-":
        zoomBy(0.8)
        break
      case "0":
        fitToViewport()
        break
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        if (!event.shiftKey) return
        stopPan()
        x += event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0
        y += event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0
        mode = "manual"
        apply()
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  viewport.addEventListener("pointerdown", onPointerDown)
  viewport.addEventListener("pointermove", onPointerMove)
  viewport.addEventListener("pointerup", onPointerEnd)
  viewport.addEventListener("pointercancel", onPointerEnd)
  viewport.addEventListener("lostpointercapture", onPointerEnd)
  viewport.addEventListener("wheel", onWheel, { passive: false })
  viewport.addEventListener("keydown", onKeyDown)
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(() => refresh()) : undefined
  observer?.observe(viewport)
  refresh(true)

  return {
    fit: fitToViewport,
    reset,
    zoomBy,
    refresh,
    destroy() {
      if (destroyed) return
      destroyed = true
      stopPan()
      observer?.disconnect()
      viewport.removeEventListener("pointerdown", onPointerDown)
      viewport.removeEventListener("pointermove", onPointerMove)
      viewport.removeEventListener("pointerup", onPointerEnd)
      viewport.removeEventListener("pointercancel", onPointerEnd)
      viewport.removeEventListener("lostpointercapture", onPointerEnd)
      viewport.removeEventListener("wheel", onWheel)
      viewport.removeEventListener("keydown", onKeyDown)
    },
  }
}
