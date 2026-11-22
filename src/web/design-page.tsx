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
  const view = frame.contentWindow
  if (!view) return
  const shell = getComputedStyle(frame.ownerDocument.documentElement)
  const palette = view.getComputedStyle(document.documentElement)
  const color = (style: CSSStyleDeclaration, property: string) =>
    style.getPropertyValue(property).trim().toLowerCase()
  if (
    color(palette, "--color-paper") !== color(shell, "--paper") ||
    color(palette, "--color-ink") !== color(shell, "--ink") ||
    !["", color(shell, "--accent")].includes(color(palette, "--color-accent")) ||
    view.getComputedStyle(document.body).backgroundColor !== shell.backgroundColor
  )
    return
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
  const observer = useRef<ResizeObserver | undefined>(undefined)
  useEffect(() => () => observer.current?.disconnect(), [])
  return (
    <iframe
      className="design-page"
      data-block-id={id}
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={({ currentTarget: frame }) => {
        observer.current?.disconnect()
        const child = frame.contentDocument
        if (!child?.body) return
        installEditorialFonts(child)
        alignDefaultPaper(frame, child)
        const { body } = child
        const scrollRegions = [...body.querySelectorAll<HTMLElement>(".diagram-container")].filter(
          (element) => !element.hasAttribute("tabindex"),
        )
        const update = () => {
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
          const margin = frame.contentWindow?.getComputedStyle(body).marginBottom ?? "0"
          const bounds = body.getBoundingClientRect()
          const height = Math.ceil(
            bounds.top +
              Math.max(bounds.height, body.scrollHeight) +
              (Number.parseFloat(margin) || 0),
          )
          const cssHeight = `${height}px`
          if (frame.style.height !== cssHeight) frame.style.height = cssHeight
        }
        observer.current = new ResizeObserver(update)
        observer.current.observe(body)
        update()
      }}
    />
  )
}
