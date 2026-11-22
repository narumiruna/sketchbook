import type { DiagramDeck, MermaidSlide, SketchbookDocument } from "../../src/document.js"

export function mermaidDeck(document: SketchbookDocument, id: string) {
  const deck = document.blocks.find((block) => block.id === id)
  if (deck?.type !== "diagram-deck" || !deck.slides.every((slide) => "mermaid" in slide)) {
    throw new Error(`Missing Mermaid fixture deck: ${id}`)
  }
  return deck as Omit<DiagramDeck, "slides"> & { slides: MermaidSlide[] }
}
