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

export function chapterNumber(index: number): string {
  return String(index + 1).padStart(2, "0")
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
  const label = useId()
  const isBook = chapters.length > 1
  const sections = chapter.sections.length > 0 && (
    <ol className="contents-sections" aria-label={isBook ? "Chapter contents" : undefined}>
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
  )
  return (
    <aside className="book-contents" aria-label="Contents">
      <nav aria-labelledby={label}>
        <p id={label} className="contents-label">
          {isBook ? "Book contents" : "Chapter contents"}
        </p>
        {isBook ? (
          <ol className="contents-chapters">
            {chapters.map(({ id, title }, index) => (
              <li key={id}>
                <a
                  className="contents-chapter"
                  href={links.href(id)}
                  onClick={links.follow}
                  aria-current={id === chapter.id ? "page" : undefined}
                >
                  <span aria-hidden="true">{chapterNumber(index)}</span>
                  {title}
                </a>
                {id === chapter.id && sections}
              </li>
            ))}
          </ol>
        ) : (
          sections
        )}
      </nav>
    </aside>
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
