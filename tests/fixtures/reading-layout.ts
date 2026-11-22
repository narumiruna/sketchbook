import type { DiagramDeck, SketchbookDocument } from "../../src/document.js"
import { drawing } from "./static-drawing.js"

export function readingFixture(): SketchbookDocument {
  return {
    schemaVersion: 1,
    title: "Request processing teaching model",
    blocks: [
      {
        id: "scope",
        type: "markdown",
        markdown: "## Scope\n\nThis teaching model tests reading layout, not a production service.",
      },
      {
        id: "reading",
        type: "diagram-deck",
        title: "How does a request become a saved document?",
        slides: [
          {
            id: "compact",
            title: "Validate inputs before committing the replacement",
            svg: drawing("Client → Check → Saved", 290, 140),
            explanationMarkdown:
              "The client supplies the complete input. Check accepts valid input before Saved records the result.\n\nThis paragraph stays unchanged in before/after layout captures. It must remain readable beside the diagram on desktop and below it on narrow screens.",
          },
          {
            id: "wide",
            title: "Separate independent inputs without clipping the graph",
            svg: drawing("Inputs A and B → Separate checks → Saved results", 960, 240),
            explanationMarkdown:
              "Two independent inputs follow the same check and save stages. A wide graph remains contained; the layout must not change its direction or meaning.",
          },
          {
            id: "tall",
            title: "Keep a long process readable alongside its explanation",
            svg: drawing("Stage 0 → Stage 10", 340, 900),
            explanationMarkdown:
              "This stress case tests how a tall diagram fits into the reading page.\n\n```typescript\nconst stages = 11\n```",
          },
        ],
      },
      {
        id: "result",
        type: "markdown",
        markdown: "## Result\n\nLayout changes must preserve all authored content.",
      },
    ],
  }
}

export function paginationFixture(): SketchbookDocument {
  const document = readingFixture()
  const deck = document.blocks[1] as DiagramDeck
  deck.slides = Array.from({ length: 20 }, (_, index) => ({
    ...deck.slides[0],
    id: `part-${index + 1}`,
    title: `Part ${index + 1}: a complete, untruncated teaching title`,
  }))
  return document
}
