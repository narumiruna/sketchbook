import { type MouseEvent, useEffect, useId, useState } from "react"
import type { Chapter, Section } from "../book.js"

interface ChapterLinks {
  href: (chapterId: string, sectionId?: string) => string
  follow: (event: MouseEvent<HTMLAnchorElement>) => void
}

export function useBookLocation(documentId: string, token: string) {
  const [location, setLocation] = useState(() => ({ search: window.location.search, focus: false }))
  useEffect(() => {
    let frame = 0
    const pop = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const search = window.location.search
        setLocation((previous) => (previous.search === search ? previous : { search, focus: true }))
      })
    }
    window.addEventListener("popstate", pop)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("popstate", pop)
    }
  }, [])

  const links: ChapterLinks = {
    href(chapterId, sectionId) {
      const search = new URLSearchParams({ documentId })
      if (chapterId !== documentId) search.set("chapter", chapterId)
      if (sectionId !== undefined) search.set("section", sectionId)
      return `${window.location.pathname}?${search}#${new URLSearchParams({ token })}`
    },
    follow(event) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return
      }
      event.preventDefault()
      const href = event.currentTarget.href
      if (href !== window.location.href) window.history.pushState(null, "", href)
      setLocation({ search: window.location.search, focus: true })
    },
  }
  return { location, links }
}

export function BookContents({
  chapters,
  chapter,
  section,
  links,
}: {
  chapters: Chapter[]
  chapter: Chapter
  section?: Section
  links: ChapterLinks
}) {
  const bookLabel = useId()
  const chapterLabel = useId()
  if (chapters.length < 2 && !chapter.sections.length) return null
  return (
    <div className="book-contents">
      {chapters.length > 1 && (
        <nav aria-labelledby={bookLabel}>
          <h2 id={bookLabel}>Book contents</h2>
          <ol>
            {chapters.map(({ id, title }) => (
              <li key={id}>
                <a
                  href={links.href(id)}
                  onClick={links.follow}
                  aria-current={id === chapter.id ? "page" : undefined}
                >
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {chapter.sections.length > 0 && (
        <nav aria-labelledby={chapterLabel}>
          <h2 id={chapterLabel}>Chapter contents</h2>
          <ol>
            {chapter.sections.map(({ id, title }) => (
              <li key={id}>
                <a
                  href={links.href(chapter.id, id)}
                  onClick={links.follow}
                  aria-current={id === section?.id ? "location" : undefined}
                >
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  )
}

export function ChapterOrder({
  previous,
  next,
  links,
}: {
  previous?: Chapter
  next?: Chapter
  links: ChapterLinks
}) {
  if (!previous && !next) return null
  return (
    <nav className="chapter-order" aria-label="Chapter order">
      {previous && (
        <a href={links.href(previous.id)} onClick={links.follow} rel="prev">
          <span>Previous chapter:</span> {previous.title}
        </a>
      )}
      {next && (
        <a href={links.href(next.id)} onClick={links.follow} rel="next">
          <span>Next chapter:</span> {next.title}
        </a>
      )}
    </nav>
  )
}
