import { useEffect, useMemo, useRef } from "react"
import { prepareDesignHtml } from "../design-html.js"
import type { DesignHtmlBlock } from "../document.js"
import { installEditorialFonts } from "./editorial-fonts"

export function DesignPage({ block }: { block: DesignHtmlBlock }) {
  const prepared = useMemo(() => {
    try {
      return { html: prepareDesignHtml(block.html) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [block.html])
  if ("error" in prepared)
    return (
      <p role="alert" className="render-error">
        {prepared.error}
      </p>
    )
  return (
    <DesignDocument key={prepared.html} id={block.id} title={block.title} html={prepared.html} />
  )
}

function alignDefaultPaper(frame: HTMLIFrameElement, document: Document) {
  if (!document.body.classList.contains("sketchbook-default-layout")) return
  const style = document.createElement("style")
  style.textContent = `
    html body { display: block; margin: 0; padding: 0; }
    body > :is(main, .frame) { margin: 0; padding: 0; width: 100%; max-width: none; }
    body > :is(main, .frame) > section:first-child { padding-block-start: 0; border-block-start: 0; }
  `
  document.head.append(style)
  frame.setAttribute("data-default-paper", "")
}

function DesignDocument({ id, title, html }: { id: string; title: string; html: string }) {
  const cleanup = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => cleanup.current?.(), [])
  return (
    <iframe
      className="design-page"
      data-block-id={id}
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={({ currentTarget: frame }) => {
        cleanup.current?.()
        const child = frame.contentDocument
        const view = frame.contentWindow
        if (!child?.body || !view) return
        installEditorialFonts(child)
        alignDefaultPaper(frame, child)
        const { body } = child
        const scrollRegions = [...body.querySelectorAll<HTMLElement>(".diagram-container")].filter(
          (element) => !element.hasAttribute("tabindex"),
        )
        const update = () => {
          frame.style.height = "150px"
          const bounds = body.getBoundingClientRect()
          const margin = Number.parseFloat(view.getComputedStyle(body).marginBottom) || 0
          const height = Math.ceil(bounds.top + Math.max(bounds.height, body.scrollHeight) + margin)
          frame.style.height = `${Math.max(1, height)}px`
          for (const element of scrollRegions) {
            const overflow = element.scrollWidth > element.clientWidth
            element.tabIndex = overflow ? 0 : -1
            if (
              overflow &&
              !element.hasAttribute("aria-label") &&
              !element.hasAttribute("aria-labelledby")
            ) {
              element.setAttribute(
                "aria-label",
                element.querySelector("svg title")?.textContent?.trim() || title,
              )
              element.setAttribute("role", "region")
            }
          }
        }
        let width = frame.clientWidth
        let pending = 0
        const schedule = () => {
          if (pending) return
          pending = requestAnimationFrame(() => {
            pending = 0
            update()
          })
        }
        const observer = new ResizeObserver(() => {
          if (width === frame.clientWidth) return
          width = frame.clientWidth
          schedule()
        })
        observer.observe(frame)
        child.fonts.addEventListener("loadingdone", schedule)
        cleanup.current = () => {
          observer.disconnect()
          cancelAnimationFrame(pending)
          child.fonts.removeEventListener("loadingdone", schedule)
        }
        update()
      }}
    />
  )
}
