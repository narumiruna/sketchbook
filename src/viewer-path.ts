const chapterIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const pagePathPattern = /^\/view-[0-9a-f-]{36}(?:~[A-Za-z0-9][A-Za-z0-9_-]{0,63})?$/

export function viewerPagePath(documentId: string, chapterId?: string | null): string | undefined {
  const chapter = chapterId && chapterIdPattern.test(chapterId) ? `~${chapterId}` : ""
  const path = `/view-${documentId}${chapter}`
  return isViewerPagePath(path) ? path : undefined
}

export function isViewerPagePath(path: string): boolean {
  return pagePathPattern.test(path)
}
