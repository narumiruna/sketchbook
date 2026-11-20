import { createDiagramView as createCamera } from "@narumitw/diagram-viewer/core"
import { describe, expect, it, vi } from "vitest"
import { createDiagramView, type DiagramViewState } from "../src/web/diagram-view.js"

vi.mock("@narumitw/diagram-viewer/core", () => ({
  createDiagramView: vi.fn(),
  minDiagramScale: 0.25,
  maxDiagramScale: 4,
}))

function fixture(initialSize?: [number, number]) {
  const properties = new Map<string, string>()
  const frame = { className: "", setAttribute: vi.fn(), remove: vi.fn() }
  const viewport = {
    clientWidth: 532,
    clientHeight: 332,
    hidden: false,
    style: {
      setProperty: vi.fn((name: string, value: string) => properties.set(name, value)),
      removeProperty: vi.fn((name: string) => properties.delete(name)),
    },
    ownerDocument: { activeElement: null },
  }
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
    if (viewport.hidden) return
    coreOptions.onScaleChange?.(scale, minimum, maximum)
    coreOptions.onCropChange?.(cropped)
  }
  vi.mocked(createCamera).mockImplementationOnce((_viewport, _stage, options) => {
    coreOptions = options ?? {}
    expect(coreOptions.isInteractionEnabled?.()).toBe(false)
    // The real core may call back before the controller has been assigned.
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
  }
}

// Only the host contract is tested here. The shared camera's geometry and
// gestures are tested upstream and through Sketchbook's browser integration.
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
    const { controller, height, publish, setSvg, state, viewport } = fixture([1000, 500])
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
    publish(1.25, 0.1875, 3.75, true)
    expect(height()).toBe("232px")
    setSvg(100, 50)
    controller.refresh()
    expect(height()).toBe("82px")
  })

  it("cleans up the camera, frame, and inline height once on unmount", () => {
    const { camera, frame, controller, coreOptions, height, states } = fixture([1000, 500])
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
    expect(frame.remove).toHaveBeenCalledTimes(1)
    expect(height()).toBeUndefined()
    expect(states).toHaveLength(reports)
  })
})
