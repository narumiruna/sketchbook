type Location = "The original page" | "A book chapter or section" | "This change"

export class RetiredMermaidError extends Error {
  constructor(location: Location) {
    super(
      `${location} contains a Mermaid diagram. This version cannot open or write it. Use the Sketchbook build from 10bc857 to open the original files; see “Open older books” in the README.`,
    )
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function items(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function legacySlide(value: unknown): boolean {
  return typeof record(value).mermaid === "string"
}

function legacyBlock(value: unknown): boolean {
  const block = record(value)
  return block.type === "diagram-deck" && items(block.slides).some(legacySlide)
}

function legacyPage(value: unknown): boolean {
  return items(record(value).blocks).some(legacyBlock)
}

function legacySections(value: unknown): boolean {
  return items(record(value).sections).some(legacyPage)
}

function legacyChapter(value: unknown): boolean {
  return legacyPage(value) || legacySections(value)
}

export function rejectRetiredDocument(value: unknown): void {
  if (legacyPage(value)) throw new RetiredMermaidError("The original page")
}

export function rejectRetiredBook(value: unknown): void {
  if (legacySections(value) || items(record(value).chapters).some(legacyChapter)) {
    throw new RetiredMermaidError("A book chapter or section")
  }
}

export function rejectRetiredEdit(value: unknown): void {
  const operation = record(record(value).operation)
  if (
    (operation.type === "append-slide" && legacySlide(operation.slide)) ||
    ((operation.type === "append-block" || operation.type === "replace-block") &&
      legacyBlock(operation.block)) ||
    (operation.type === "add-chapter" && legacyChapter(operation.chapter)) ||
    (operation.type === "add-section" && legacyPage(operation.section))
  )
    throw new RetiredMermaidError("This change")
}

export function rejectRetiredDocumentEnvelope(value: unknown): void {
  rejectRetiredDocument(record(value).document)
}
