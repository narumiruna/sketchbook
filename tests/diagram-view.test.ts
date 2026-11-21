import { createDiagramView as createCamera } from "@narumitw/diagram-viewer/core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDiagramView, type DiagramViewState } from "../src/web/diagram-view.js"

vi.mock("@narumitw/diagram-viewer/core", () => ({
  createDiagramView: vi.fn(),
  minDiagramScale: 0.25,
  maxDiagramScale: 4,
}))

afterEach(() => vi.unstubAllGlobals())

function fixture(initialSize?: [number, number]) {
  let notifyResize = () => {}
  let runFrame: FrameRequestCallback | undefined
  const disconnect = vi.fn()
  const cancelFrame = vi.fn(() => {
    runFrame = undefined
  })
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        notifyResize = callback
      }
      observe() {}
      disconnect = disconnect
    },
  )
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    runFrame = callback
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", cancelFrame)

  const properties = new Map<string, string>()
  const frame = { className: "", setAttribute: vi.fn(), remove: vi.fn() }
  const viewport = Object.assign(new EventTarget(), {
    clientWidth: 532,
    clientHeight: 332,
    hidden: false,
    style: {
      setProperty: vi.fn((name: string, value: string) => properties.set(name, value)),
      removeProperty: vi.fn((name: string) => properties.delete(name)),
    },
    ownerDocument: { activeElement: null },
  })
  const stage = {
    firstElementChild: null as SVGSVGElement | null,
    querySelector: () => stage.firstElementChild,
    ownerDocument: { createElement: vi.fn(() => frame) },
    getClientRects: () => (viewport.hidden ? [] : [{}]),
    append: vi.fn(),
  }
  function setSvg(width: number, height: number) {
    stage.firstElementChild = {
      viewBox: { baseVal: { width, height } },
      getBoundingClientRect: () => {
        expect(camera.refresh).toHaveBeenCalled()
        return { left: 0, top: 0, width, height }
      },
      querySelectorAll: () => [
        {
          id: "render-flowchart-A-0",
          getBoundingClientRect: () => ({
            left: 20,
            top: 20,
            right: 40,
            bottom: 40,
            width: 20,
            height: 20,
          }),
        },
      ],
    } as unknown as SVGSVGElement
  }
  if (initialSize) setSvg(...initialSize)
  const camera = {
    getState: vi.fn(),
    refresh: vi.fn(() => publish()),
    setCameraMode: vi.fn(),
    setFocusRegion: vi.fn(),
    reset: vi.fn(),
    zoomBy: vi.fn(),
    destroy: vi.fn(),
  }
  let coreOptions: NonNullable<Parameters<typeof createCamera>[2]>
  function publish(scale = 0.5, minimum = 0.238, maximum = 4, cropped = false) {
    if (viewport.hidden || viewport.clientWidth <= 32 || viewport.clientHeight <= 32) return
    coreOptions.onScaleChange?.(scale, minimum, maximum)
    coreOptions.onCropChange?.(cropped)
  }
  vi.mocked(createCamera).mockImplementationOnce((_viewport, _stage, options) => {
    coreOptions = options ?? {}
    expect(coreOptions.isInteractionEnabled?.()).toBe(false)
    publish()
    return camera
  })
  const states: DiagramViewState[] = []
  const controller = createDiagramView(
    viewport as unknown as HTMLElement,
    stage as unknown as HTMLElement,
    { onChange: (state) => states.push(state) },
  )
  return {
    camera,
    controller,
    stage,
    viewport,
    frame,
    coreOptions: () => coreOptions,
    height: () => properties.get("--diagram-content-height"),
    state: () => states.at(-1),
    states,
    setSvg,
    publish,
    disconnect,
    cancelFrame,
    notifyResize: () => notifyResize(),
    flushFrame: () => {
      const callback = runFrame
      runFrame = undefined
      callback?.(0)
    },
  }
}

describe("diagram view adapter", () => {
  it("waits for a valid SVG before enabling interaction or camera controls", () => {
    const { camera, controller, coreOptions, setSvg, state } = fixture()
    expect(coreOptions()).toMatchObject({
      manageInlineHeight: false,
      resetMode: "native",
      focusMaxScale: 2,
    })
    expect(coreOptions().getKeyboardPan?.()).toBe("shift-arrows")
    expect(coreOptions().isExpanded).toBeUndefined()
    for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      setSvg(width, 500)
      controller.refresh()
      expect(state()?.ready).toBe(false)
      expect(coreOptions().isInteractionEnabled?.()).toBe(false)
      controller.fit()
      controller.reset()
      controller.zoomBy(2)
    }
    expect(camera.setCameraMode).not.toHaveBeenCalled()
    expect(camera.reset).not.toHaveBeenCalled()
    expect(camera.zoomBy).not.toHaveBeenCalled()
    setSvg(1000, 500)
    controller.refresh()
    expect(state()?.ready).toBe(true)
    expect(coreOptions().isInteractionEnabled?.()).toBe(true)
    expect(camera.setCameraMode).toHaveBeenLastCalledWith("overview")
    controller.reset()
    controller.zoomBy(1.25)
    expect(camera.reset).toHaveBeenCalledTimes(1)
    expect(camera.zoomBy).toHaveBeenCalledWith(1.25)
  })

  it("rejects a stale SVG and applies a fresh overview on replacement", () => {
    const { camera, controller, coreOptions, setSvg, stage, state } = fixture([1000, 500])
    setSvg(1000, 500)
    expect(coreOptions().isInteractionEnabled?.()).toBe(false)
    camera.setCameraMode.mockClear()
    controller.refresh()
    expect(camera.setCameraMode).toHaveBeenCalledExactlyOnceWith("overview")
    expect(coreOptions().isInteractionEnabled?.()).toBe(true)
    stage.firstElementChild = null
    controller.refresh()
    expect(state()?.ready).toBe(false)
  })

  it("defers a slide change while showing source and reapplies an identical focus", () => {
    const { camera, controller, coreOptions, frame, stage, state, viewport } = fixture([1000, 500])
    controller.setFocusNodes(["A"])
    const measured = { x: 8, y: 8, width: 44, height: 44 }
    expect(camera.setFocusRegion).toHaveBeenLastCalledWith(measured)
    expect(stage.append).toHaveBeenCalledWith(frame)
    expect(state()?.focus).toBe("ready")
    controller.fit()
    expect(camera.setCameraMode).toHaveBeenLastCalledWith("overview")
    viewport.hidden = true
    controller.setFocusNodes(["A"])
    expect(camera.setFocusRegion).toHaveBeenLastCalledWith(undefined)
    expect(frame.remove).toHaveBeenCalled()
    expect(coreOptions().isInteractionEnabled?.()).toBe(false)
    expect(state()?.ready).toBe(false)
    viewport.hidden = false
    controller.refresh()
    expect(camera.setFocusRegion).toHaveBeenLastCalledWith(measured)
    expect(camera.setCameraMode).toHaveBeenLastCalledWith("focus")
    expect(state()?.focus).toBe("ready")
    controller.setFocusNodes(["Missing"])
    expect(camera.setCameraMode).toHaveBeenLastCalledWith("overview")
    expect(state()?.focus).toBe("missing")
  })

  it("updates CSS height from the natural SVG and width, not scale or viewport height", () => {
    const {
      camera,
      controller,
      flushFrame,
      height,
      notifyResize,
      publish,
      setSvg,
      state,
      viewport,
    } = fixture([1000, 500])
    expect(height()).toBe("282px")
    expect(viewport.style.setProperty).toHaveBeenCalledTimes(1)
    viewport.clientHeight = 576
    publish(1.25, 0.1875, 3.75, true)
    expect(viewport.style.setProperty).toHaveBeenCalledTimes(1)
    expect(state()).toEqual({
      ready: true,
      scale: 1.25,
      minScale: 0.1875,
      maxScale: 3.75,
      cropped: true,
    })
    viewport.clientWidth = 432
    camera.refresh.mockImplementationOnce(() => {
      expect(height()).toBe("232px")
      publish(1.25, 0.1875, 3.75, true)
    })
    notifyResize()
    expect(height()).toBe("282px")
    flushFrame()
    expect(height()).toBe("232px")
    setSvg(100, 50)
    controller.refresh()
    expect(height()).toBe("82px")
  })

  it("updates readiness when a resize leaves no room inside the camera inset", () => {
    const { viewport, notifyResize, flushFrame, state } = fixture([1000, 500])
    expect(state()?.ready).toBe(true)
    viewport.clientHeight = 32
    notifyResize()
    flushFrame()
    expect(state()?.ready).toBe(false)
    viewport.clientHeight = 332
    notifyResize()
    flushFrame()
    expect(state()?.ready).toBe(true)
  })

  it("cleans up the camera, frame, and inline height once on unmount", () => {
    const {
      camera,
      frame,
      controller,
      coreOptions,
      height,
      states,
      notifyResize,
      flushFrame,
      disconnect,
      cancelFrame,
    } = fixture([1000, 500])
    notifyResize()
    controller.setFocusNodes(["A"])
    const reports = states.length
    controller.destroy()
    controller.destroy()
    controller.refresh(true)
    controller.setFocusNodes(["A"])
    controller.reset()
    controller.fit()
    controller.zoomBy(2)
    expect(coreOptions().isInteractionEnabled?.()).toBe(false)
    expect(camera.destroy).toHaveBeenCalledTimes(1)
    expect(camera.reset).not.toHaveBeenCalled()
    expect(camera.zoomBy).not.toHaveBeenCalled()
    flushFrame()
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(cancelFrame).toHaveBeenCalledWith(1)
    expect(frame.remove).toHaveBeenCalledTimes(1)
    expect(height()).toBeUndefined()
    expect(states).toHaveLength(reports)
  })
})
