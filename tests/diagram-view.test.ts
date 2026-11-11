import { afterEach, describe, expect, it, vi } from "vitest"
import {
  constrainDiagramOffset,
  createDiagramView,
  type DiagramViewState,
  diagramFitScale,
} from "../src/web/diagram-view.js"

// Node-only DOM doubles keep these tests independent of a browser or a DOM package.
class TestElement extends EventTarget {
  clientWidth = 532
  clientHeight = 332
  clientLeft = 2
  clientTop = 2
  hidden = false
  isConnected = true
  displayed = true
  visibility = "visible"
  properties = new Map<string, string>()
  style = {
    width: "",
    height: "",
    transform: "",
    transformOrigin: "",
    setProperty: (name: string, value: string) => this.properties.set(name, value),
    removeProperty: (name: string) => this.properties.delete(name),
  }
  ownerDocument: { activeElement: TestElement | null } = { activeElement: null }
  svg: SVGSVGElement | null = null
  captures = new Set<number>()
  setPointerCapture = vi.fn((id: number) => this.captures.add(id))
  hasPointerCapture = (id: number) => this.captures.has(id)
  releasePointerCapture = vi.fn((id: number) => this.captures.delete(id))
  querySelector = () => this.svg
  getClientRects = () => (this.displayed ? [{}] : [])
  getBoundingClientRect = () => ({ left: 10, top: 20 })
  focus = () => {
    this.ownerDocument.activeElement = this
  }
}

class TestResizeObserver {
  observed: Element[] = []
  disconnect = vi.fn()
  constructor(private callback: ResizeObserverCallback) {}
  observe(element: Element) {
    this.observed.push(element)
  }
  notify() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

function svg(width = 1000, height = 500): SVGSVGElement {
  return { viewBox: { baseVal: { x: 0, y: 0, width, height } } } as SVGSVGElement
}

function fixture(initialSvg: SVGSVGElement | null = svg()) {
  const viewport = new TestElement()
  const stage = new TestElement()
  stage.svg = initialSvg
  let observer: TestResizeObserver | undefined
  vi.stubGlobal(
    "ResizeObserver",
    class extends TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback)
        observer = this
      }
    },
  )
  vi.stubGlobal("getComputedStyle", (element: TestElement) => ({ visibility: element.visibility }))
  const states: DiagramViewState[] = []
  const controller = createDiagramView(
    viewport as unknown as HTMLElement,
    stage as unknown as HTMLElement,
    { onChange: (state) => states.push(state) },
  )
  return {
    viewport,
    stage,
    controller,
    states,
    observer: () => {
      if (!observer) throw new Error("ResizeObserver missing")
      return observer
    },
    state: () => states[states.length - 1],
  }
}

function dispatch(element: TestElement, type: string, properties: Record<string, unknown> = {}) {
  const event = new Event(type, { cancelable: true, bubbles: true })
  Object.assign(event, properties)
  element.dispatchEvent(event)
  return event
}

function pointer(element: TestElement, type: string, properties: Record<string, unknown> = {}) {
  return dispatch(element, type, {
    pointerId: 7,
    pointerType: "mouse",
    button: 0,
    isPrimary: true,
    clientX: 200,
    clientY: 150,
    ...properties,
  })
}

function camera(stage: TestElement) {
  const values = stage.style.transform.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)?.map(Number)
  // The first number is the 3 in translate3d.
  if (values?.length !== 5) throw new Error("Transform missing")
  return { x: values[1], y: values[2], scale: values[4] }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("diagram geometry", () => {
  it("fits both axes with a 16px inset and never enlarges small graphs", () => {
    expect(diagramFitScale(532, 332, 1000, 500)).toBe(0.5)
    expect(diagramFitScale(532, 332, 100, 1000)).toBe(0.3)
    expect(diagramFitScale(532, 332, 100, 50)).toBe(1)
    expect(diagramFitScale(532, 332, 10000, 500)).toBe(0.05)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid size %s", (value) => {
    expect(diagramFitScale(532, 332, value, 500)).toBe(0)
    expect(diagramFitScale(532, 332, 1000, value)).toBe(0)
    expect(diagramFitScale(value, 332, 1000, 500)).toBe(0)
    expect(diagramFitScale(532, value, 1000, 500)).toBe(0)
  })

  it("rejects viewports without usable interior space", () => {
    expect(diagramFitScale(32, 332, 1000, 500)).toBe(0)
    expect(diagramFitScale(532, 16, 1000, 500)).toBe(0)
  })

  it("centers an axis that fits and bounds a cropped axis", () => {
    expect(constrainDiagramOffset(532, 100, 1, -100)).toBe(216)
    expect(constrainDiagramOffset(532, 1000, 0.5, 100)).toBe(16)
    expect(constrainDiagramOffset(532, 1000, 1, -250)).toBe(-250)
    expect(constrainDiagramOffset(532, 1000, 1, 1000)).toBe(16)
    expect(constrainDiagramOffset(532, 1000, 1, -1000)).toBe(-484)
  })
})

describe("diagram controller", () => {
  it("fits on creation, sets natural dimensions, and resets to centered native size", () => {
    const { stage, state, controller } = fixture()
    expect(state()).toEqual({ ready: true, scale: 0.5, minScale: 0.25, cropped: false })
    expect(stage.style).toMatchObject({ width: "1000px", height: "500px", transformOrigin: "0 0" })
    expect(camera(stage)).toEqual({ x: 16, y: 41, scale: 0.5 })
    controller.reset()
    expect(state()).toEqual({ ready: true, scale: 1, minScale: 0.25, cropped: true })
    expect(camera(stage)).toEqual({ x: -234, y: -84, scale: 1 })
    controller.fit()
    expect(state()).toEqual({ ready: true, scale: 0.5, minScale: 0.25, cropped: false })
    controller.destroy()
  })

  it("allows useful fit below 25% and bounds zoom at fit/25% and 400%", () => {
    const { state, controller } = fixture(svg(10000, 500))
    expect(state().scale).toBe(0.05)
    expect(state().minScale).toBe(0.05)
    controller.zoomBy(0.1)
    expect(state().scale).toBe(0.05)
    expect(state().cropped).toBe(false)
    controller.zoomBy(2)
    expect(state().scale).toBe(0.1)
    controller.zoomBy(1000)
    expect(state().scale).toBe(4)
    controller.reset()
    controller.zoomBy(0.0001)
    expect(state().scale).toBe(0.05)
    controller.destroy()

    const regular = fixture()
    regular.controller.zoomBy(0.0001)
    expect(regular.state().scale).toBe(0.25)
    regular.controller.destroy()
  })

  it("ignores invalid zoom factors", () => {
    const { controller, stage, states } = fixture()
    const before = stage.style.transform
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) controller.zoomBy(value)
    expect(stage.style.transform).toBe(before)
    expect(states).toHaveLength(1)
    controller.destroy()
  })

  it("preserves fit, native, and manual modes on viewport resize", () => {
    const { viewport, stage, controller, state, observer } = fixture()
    expect(observer().observed).toEqual([viewport])
    viewport.clientWidth = 432
    observer().notify()
    expect(state().scale).toBe(0.4)
    controller.reset()
    viewport.clientWidth = 632
    observer().notify()
    expect(camera(stage)).toEqual({ x: -184, y: -84, scale: 1 })
    controller.zoomBy(2)
    const old = camera(stage)
    const worldX = (viewport.clientWidth / 2 - old.x) / old.scale
    const worldY = (viewport.clientHeight / 2 - old.y) / old.scale
    viewport.clientWidth = 732
    viewport.clientHeight = 432
    observer().notify()
    const resized = camera(stage)
    expect(resized.scale).toBe(2)
    expect((viewport.clientWidth / 2 - resized.x) / resized.scale).toBe(worldX)
    expect((viewport.clientHeight / 2 - resized.y) / resized.scale).toBe(worldY)
    controller.refresh(true)
    expect(state().scale).toBe(0.7)
    expect(state().cropped).toBe(false)
    controller.destroy()
  })

  it("sizes the inline frame from natural dimensions and width, never zoom or observed height", () => {
    const { viewport, stage, controller, observer, state } = fixture()
    const height = () => viewport.properties.get("--diagram-content-height")
    expect(height()).toBe("282px")
    controller.reset()
    controller.zoomBy(2)
    expect(height()).toBe("282px")
    viewport.clientHeight = 282
    observer().notify()
    expect(height()).toBe("282px")
    expect(state().scale).toBe(2)
    const before = stage.style.transform
    observer().notify()
    expect(stage.style.transform).toBe(before)
    viewport.clientWidth = 432
    observer().notify()
    expect(height()).toBe("232px")
    expect(state().scale).toBe(2)
    stage.svg = svg(100, 50)
    controller.refresh(true)
    expect(height()).toBe("82px")
    stage.svg = null
    controller.refresh(true)
    expect(height()).toBeUndefined()
    controller.destroy()
  })

  it("waits for a valid SVG and refits replacement SVGs", () => {
    const { stage, controller, state } = fixture(null)
    expect(state()).toEqual({ scale: 1, minScale: 0.25, ready: false, cropped: false })
    controller.reset()
    controller.zoomBy(2)
    expect(stage.style.transform).toBe("")
    stage.svg = svg(Number.NaN)
    controller.refresh(true)
    expect(state().ready).toBe(false)
    stage.svg = svg(0)
    controller.refresh()
    expect(state().ready).toBe(false)
    stage.svg = svg()
    controller.refresh()
    expect(state().scale).toBe(0.5)
    controller.zoomBy(3)
    stage.svg = svg(100, 50)
    controller.refresh()
    expect(state()).toEqual({ scale: 1, minScale: 0.25, ready: true, cropped: false })
    expect(camera(stage)).toEqual({ x: 216, y: 141, scale: 1 })
    stage.svg = null
    controller.refresh()
    expect(state().ready).toBe(false)
    controller.destroy()
  })

  it("ignores hidden, detached, or stale stages and preserves the camera on return", () => {
    const { viewport, stage, controller, state } = fixture()
    controller.reset()
    for (const hide of [
      () => {
        stage.hidden = true
      },
      () => {
        stage.displayed = false
      },
      () => {
        stage.visibility = "hidden"
      },
      () => {
        stage.isConnected = false
      },
      () => {
        viewport.clientWidth = 0
      },
    ]) {
      hide()
      controller.refresh()
      expect(state().ready).toBe(false)
      const before = stage.style.transform
      controller.fit()
      controller.reset()
      controller.zoomBy(2)
      const wheel = dispatch(viewport, "wheel", { ctrlKey: true, deltaY: -1 })
      expect(wheel.defaultPrevented).toBe(false)
      expect(pointer(viewport, "pointerdown").defaultPrevented).toBe(false)
      expect(stage.style.transform).toBe(before)
      stage.hidden = false
      stage.displayed = true
      stage.visibility = "visible"
      stage.isConnected = true
      viewport.clientWidth = 532
      controller.refresh()
      expect(state().scale).toBe(1)
      expect(state().ready).toBe(true)
    }
    stage.svg = svg(2000)
    controller.zoomBy(2)
    expect(state().scale).toBe(1)
    controller.refresh(true)
    expect(state().scale).toBe(0.25)
    controller.destroy()
  })

  it("zooms around the wheel cursor only with Ctrl or Meta", () => {
    const { viewport, stage, controller, state } = fixture()
    controller.reset()
    const before = camera(stage)
    const point = { x: 200, y: 100 }
    const world = { x: (point.x - before.x) / before.scale, y: (point.y - before.y) / before.scale }
    expect(dispatch(viewport, "wheel", { deltaY: -1 }).defaultPrevented).toBe(false)
    for (const modifier of ["ctrlKey", "metaKey"]) {
      const event = dispatch(viewport, "wheel", {
        [modifier]: true,
        deltaY: -1,
        clientX: point.x + 12,
        clientY: point.y + 22,
      })
      expect(event.defaultPrevented).toBe(true)
      const after = camera(stage)
      expect((point.x - after.x) / after.scale).toBeCloseTo(world.x)
      expect((point.y - after.y) / after.scale).toBeCloseTo(world.y)
    }
    expect(state().scale).toBeCloseTo(1.21)
    controller.destroy()
  })

  it("consumes focused zoom/fit keys but leaves arrows and modified keys untouched", () => {
    const { viewport, controller, state } = fixture()
    expect(dispatch(viewport, "keydown", { key: "+" }).defaultPrevented).toBe(false)
    viewport.focus()
    expect(dispatch(viewport, "keydown", { key: "+" }).defaultPrevented).toBe(true)
    expect(state().scale).toBe(0.625)
    expect(dispatch(viewport, "keydown", { key: "-" }).defaultPrevented).toBe(true)
    expect(state().scale).toBe(0.5)
    controller.reset()
    expect(dispatch(viewport, "keydown", { key: "0" }).defaultPrevented).toBe(true)
    expect(state().scale).toBe(0.5)
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape", "a"]) {
      const event = dispatch(viewport, "keydown", { key })
      expect(event.defaultPrevented).toBe(false)
      expect(event.cancelBubble).toBe(false)
    }
    for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
      expect(dispatch(viewport, "keydown", { key: "+", [modifier]: true }).defaultPrevented).toBe(
        false,
      )
    }
    expect(state().scale).toBe(0.5)
    controller.destroy()
  })

  it("pans the focused camera with Shift+arrows in bounded 40px steps", () => {
    const { viewport, stage, controller, observer } = fixture()
    controller.reset()
    viewport.focus()
    const pan = (key: string) => dispatch(viewport, "keydown", { key, shiftKey: true })
    expect(pan("ArrowRight").defaultPrevented).toBe(true)
    expect(camera(stage)).toEqual({ x: -274, y: -84, scale: 1 })
    expect(pan("ArrowDown").defaultPrevented).toBe(true)
    expect(camera(stage)).toEqual({ x: -274, y: -124, scale: 1 })
    pan("ArrowLeft")
    pan("ArrowUp")
    expect(camera(stage)).toEqual({ x: -234, y: -84, scale: 1 })
    for (let count = 0; count < 30; count++) {
      pan("ArrowRight")
      pan("ArrowDown")
    }
    expect(camera(stage)).toEqual({ x: -484, y: -184, scale: 1 })
    for (let count = 0; count < 30; count++) {
      pan("ArrowLeft")
      pan("ArrowUp")
    }
    expect(camera(stage)).toEqual({ x: 16, y: 16, scale: 1 })
    observer().notify()
    expect(camera(stage)).toEqual({ x: 16, y: 16, scale: 1 })
    controller.fit()
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) pan(key)
    expect(camera(stage)).toEqual({ x: 16, y: 41, scale: 0.5 })
    controller.destroy()
  })

  it("keeps keyboard pan local to an interactive, focused viewport", () => {
    const { viewport, stage, controller } = fixture()
    controller.reset()
    const before = stage.style.transform
    const pan = (properties: Record<string, unknown> = {}) =>
      dispatch(viewport, "keydown", { key: "ArrowRight", shiftKey: true, ...properties })
    expect(pan().defaultPrevented).toBe(false)
    viewport.focus()
    for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
      expect(pan({ [modifier]: true }).defaultPrevented).toBe(false)
    }
    viewport.hidden = true
    expect(pan().defaultPrevented).toBe(false)
    viewport.hidden = false
    stage.svg = svg()
    expect(pan().defaultPrevented).toBe(false)
    expect(stage.style.transform).toBe(before)
    controller.destroy()
    expect(pan().defaultPrevented).toBe(false)
  })

  it.each(["mouse", "pen"])("pans primary %s with pointer capture and bounds", (pointerType) => {
    const { viewport, stage, controller } = fixture()
    controller.reset()
    const down = pointer(viewport, "pointerdown", { pointerType })
    expect(down.defaultPrevented).toBe(true)
    expect(viewport.setPointerCapture).toHaveBeenCalledWith(7)
    expect(viewport.ownerDocument.activeElement).toBe(viewport)
    pointer(viewport, "pointermove", { clientX: 100, clientY: 100 })
    expect(camera(stage)).toEqual({ x: -334, y: -134, scale: 1 })
    pointer(viewport, "pointermove", { clientX: -10000, clientY: -10000 })
    expect(camera(stage)).toEqual({ x: -484, y: -184, scale: 1 })
    pointer(viewport, "pointerup")
    expect(viewport.releasePointerCapture).toHaveBeenCalledWith(7)
    const before = stage.style.transform
    pointer(viewport, "pointermove", { clientX: 10000 })
    expect(stage.style.transform).toBe(before)
    controller.destroy()
  })

  it.each(["pointercancel", "lostpointercapture"])("stops pan on %s", (type) => {
    const { viewport, stage, controller } = fixture()
    controller.reset()
    pointer(viewport, "pointerdown")
    pointer(viewport, "pointermove", { clientX: 100 })
    const before = stage.style.transform
    pointer(viewport, type)
    pointer(viewport, "pointermove", { clientX: 0 })
    expect(stage.style.transform).toBe(before)
    expect(viewport.captures.size).toBe(0)
    controller.destroy()
  })

  it("does not consume touch, secondary pointers, or non-primary buttons", () => {
    const { viewport, controller } = fixture()
    for (const properties of [{ pointerType: "touch" }, { isPrimary: false }, { button: 1 }]) {
      expect(pointer(viewport, "pointerdown", properties).defaultPrevented).toBe(false)
    }
    expect(viewport.setPointerCapture).not.toHaveBeenCalled()
    expect(pointer(viewport, "pointermove", { pointerType: "touch" }).defaultPrevented).toBe(false)
    controller.destroy()
  })

  it("stops captured pan when the source is replaced or hidden", () => {
    const { viewport, stage, controller } = fixture()
    controller.reset()
    pointer(viewport, "pointerdown")
    stage.hidden = true
    pointer(viewport, "pointermove", { clientX: 0 })
    expect(viewport.captures.size).toBe(0)
    stage.hidden = false
    pointer(viewport, "pointerdown")
    stage.svg = null
    controller.refresh()
    expect(viewport.captures.size).toBe(0)
    controller.destroy()
  })

  it("disconnects, releases capture, and removes every listener on idempotent destroy", () => {
    const { viewport, stage, controller, states, observer } = fixture()
    const remove = vi.spyOn(viewport, "removeEventListener")
    controller.reset()
    pointer(viewport, "pointerdown")
    const before = stage.style.transform
    const reports = states.length
    controller.destroy()
    controller.destroy()
    expect(viewport.captures.size).toBe(0)
    expect(viewport.releasePointerCapture).toHaveBeenCalledTimes(1)
    expect(observer().disconnect).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls.map(([name]) => name).sort()).toEqual([
      "keydown",
      "lostpointercapture",
      "pointercancel",
      "pointerdown",
      "pointermove",
      "pointerup",
      "wheel",
    ])
    observer().notify()
    controller.refresh(true)
    controller.fit()
    controller.reset()
    controller.zoomBy(2)
    viewport.focus()
    dispatch(viewport, "keydown", { key: "+" })
    expect(
      dispatch(viewport, "keydown", { key: "ArrowRight", shiftKey: true }).defaultPrevented,
    ).toBe(false)
    expect(dispatch(viewport, "wheel", { ctrlKey: true, deltaY: -1 }).defaultPrevented).toBe(false)
    pointer(viewport, "pointerdown")
    pointer(viewport, "pointermove", { clientX: 0 })
    expect(stage.style.transform).toBe(before)
    expect(states).toHaveLength(reports)
  })
})
