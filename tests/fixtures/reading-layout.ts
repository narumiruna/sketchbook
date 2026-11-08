import type { DiagramDeck, SketchbookDocument } from "../../src/document.js"

// Teaching-model facts: a client submits input, a check accepts it, then output
// is saved. These diagrams test layout, not a source-verified production system.
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
            mermaid:
              'flowchart TD\n Client["Client"] --> Check["Check"]\n Check --> Saved["Saved"]',
            explanationMarkdown:
              "The client supplies the complete input. Check accepts valid input before Saved records the result.\n\nThis paragraph stays unchanged in before/after layout captures. It must remain readable beside the diagram on desktop and below it on narrow screens.",
          },
          {
            id: "wide",
            title: "Separate independent inputs without clipping the graph",
            mermaid:
              'flowchart LR\n A["Input A"] --> B["Check A"] --> C["Saved A"]\n D["Input B"] --> E["Check B"] --> F["Saved B"]',
            explanationMarkdown:
              "Two independent inputs follow the same check and save stages. A wide graph remains contained; the layout must not change its direction or meaning.",
          },
          {
            id: "tall",
            title: "Keep a long process bounded without changing the camera rules",
            mermaid: `flowchart TD\n${Array.from({ length: 10 }, (_, index) => `N${index}["Stage ${index}"] --> N${index + 1}["Stage ${index + 1}"]`).join("\n")}`,
            explanationMarkdown:
              "This stress case tests bounded height and camera controls. Its initial fitted labels are not a compact-teaching readability target.\n\n```typescript\nconst stages = 11\n```",
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
