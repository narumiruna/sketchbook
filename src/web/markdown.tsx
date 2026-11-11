import type { Element, Root } from "hast"
import { Component, type MouseEvent, type ReactNode, useId } from "react"
import ReactMarkdown, { defaultUrlTransform } from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

interface Props {
  markdown: string
  context: string
  scope?: "article" | "explanation"
}

function rehypeHeadings({ scope }: { scope: Props["scope"] }) {
  return (tree: Root) => {
    const headings: Element[] = []
    const collect = (parent: Root | Element) => {
      for (const child of parent.children) {
        if (child.type !== "element") continue
        if (/^h[1-6]$/.test(child.tagName)) headings.push(child)
        collect(child)
      }
    }
    collect(tree)
    if (!headings.length) return
    const minimum = Math.min(...headings.map((heading) => Number(heading.tagName.slice(1))))
    // Keep article H2+ unchanged. Legacy H1 blocks move down as one outline.
    // Explanation headings belong below the slide H3, not in the article outline.
    const offset = scope === "explanation" ? 4 - minimum : minimum === 1 ? 1 : 0
    for (const heading of headings) {
      heading.tagName = `h${Math.min(6, Number(heading.tagName.slice(1)) + offset)}`
    }
  }
}

function rehypeSafeKatex({ context }: { context: string }) {
  const render = rehypeKatex({ trust: false, maxExpand: 1000, maxSize: 20, strict: "error" })
  return (...[tree, file]: Parameters<typeof render>) => {
    render(tree, file)
    // KaTeX can return colored fallback markup instead of a katex-error span.
    // Preserve every parser diagnostic independently of that markup shape.
    for (const message of file.messages) {
      if (message.source !== "rehype-katex") continue
      const place = message.place
      const start = place && "start" in place ? place.start.offset : undefined
      const end = place && "end" in place ? place.end.offset : undefined
      const source = String(file.value).slice(start ?? 0, end)
      tree.children.push({
        type: "element",
        tagName: "div",
        properties: { className: ["render-error"], role: "alert" },
        children: [
          {
            type: "element",
            tagName: "p",
            properties: {},
            children: [
              {
                type: "text",
                value: `${context}: Formula error: ${message.cause instanceof Error ? message.cause.message : message.reason}`,
              },
            ],
          },
          {
            type: "element",
            tagName: "pre",
            properties: {},
            children: [
              {
                type: "element",
                tagName: "code",
                properties: {},
                children: [{ type: "text", value: source }],
              },
            ],
          },
        ],
      })
    }
  }
}

function rehypeFootnoteLabel({ id }: { id: string }) {
  return (tree: Root) => {
    const visit = (parent: Root | Element) => {
      for (const child of parent.children) {
        if (child.type !== "element") continue
        if (child.properties.id === "footnote-label") child.properties.id = id
        if (child.properties.dataFootnoteRef) child.properties.ariaDescribedBy = [id]
        visit(child)
      }
    }
    visit(tree)
  }
}

function followFragment(event: MouseEvent<HTMLAnchorElement>, href: string | undefined) {
  if (
    !href?.startsWith("#") ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return
  // In-page navigation must not replace the viewer's fragment capability.
  event.preventDefault()
  const fragment = href.slice(1)
  let id = fragment
  // Generated footnote IDs contain their encoded identifiers literally.
  if (!event.currentTarget.matches("[data-footnote-ref], [data-footnote-backref]")) {
    try {
      id = decodeURIComponent(fragment)
    } catch {
      // A literal target can still exist when the fragment is not valid URI text.
    }
  }
  const target = document.getElementById(id) ?? document.getElementById(fragment)
  if (!target) return
  target.scrollIntoView({ block: "start" })
  if (target.tabIndex < 0) target.tabIndex = -1
  target.focus({ preventScroll: true })
}

function safeUrl(value: string) {
  const safe = defaultUrlTransform(value)
  if (/^(?:https?:|mailto:|#|\/|\.\.?\/)/i.test(safe)) return safe
  return safe.includes(":") ? "" : safe
}

class MarkdownBoundary extends Component<
  Props & { children: ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="render-error">
          <p>
            {this.props.context}: Markdown or formula error: {this.state.error}
          </p>
          <pre>
            <code>{this.props.markdown}</code>
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export function Markdown({ markdown, context, scope = "article" }: Props) {
  const prefix = `user-content-${useId()}-`
  return (
    <MarkdownBoundary key={markdown} markdown={markdown} context={context}>
      <div className="markdown">
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm, remarkMath]}
          remarkRehypeOptions={{ clobberPrefix: prefix }}
          rehypePlugins={[
            [rehypeFootnoteLabel, { id: `${prefix}footnote-label` }],
            [rehypeHeadings, { scope }],
            [rehypeSafeKatex, { context }],
          ]}
          urlTransform={safeUrl}
          components={{
            img: ({ alt }) => <span className="image-omitted">[Image omitted: {alt ?? ""}]</span>,
            a: ({ node: _node, href, children, ...props }) => (
              <a
                {...props}
                href={href}
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                onClick={(event) => followFragment(event, href)}
              >
                {children}
              </a>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </MarkdownBoundary>
  )
}
