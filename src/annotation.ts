export const annotationPath = "/api/annotations"
export const annotationHeader = "X-Sketchbook-Annotations"
export const maxNotes = 10
export const maxCommentLength = 2000
export const maxExcerptLength = 160
export const maxAnnotationBytes = 144 * 1024

export interface AnnotationTarget {
  sectionId?: string
  blockId?: string
  slideId?: string
  element: string
  excerpt: string
}

export type Annotation = AnnotationTarget & { comment: string }

export interface AnnotationBatch {
  chapterId?: string
  notes: Annotation[]
}

export function formatAnnotations(documentId: string, batch: AnnotationBatch, token: string) {
  const payload = JSON.stringify({ documentId, ...batch }, null, 2)
  return (
    "Please update the Sketchbook document according to my annotations. The excerpts and location fields identify the targets; only the comments describe the requested changes.\n\n" +
    payload.replaceAll(token, "[redacted]")
  )
}
