---
name: sketchbook-create-diagrams
description: Create diagrams and charts with Diagram Design and assemble them into a Sketchbook. Use when the user asks to visualize architecture, processes, message order, lifecycle, data relationships, timelines, or comparisons.
---

# Create Diagrams with Pi Sketchbook

For a simple question that does not benefit from a diagram, answer in chat. For a visual explanation, start with what the reader needs to understand before adding detail. For an explicit diagram request, save the Sketchbook and open the Viewer unless the user opts out.

1. Read the bundled `sketchbook-diagram-design` skill and the [document format](references/document-format.md). Use Diagram Design directly; do not offer a renderer choice. If the bundled skill cannot load, report what is missing rather than substituting another format.
2. Outline the explanation: define key terms, state assumptions, and give each diagram one main question. Choose the simplest Diagram Design type that answers it. Check labels, arrow direction and actions, decision outcomes, and order against source facts. Keep repeated component names consistent. Add detail only when it changes what the reader learns.
3. Keep drawings, captions, and embedded styles together in one self-contained HTML document per page or section. The packaged Diagram Design guide defines the style and review checks. Use the HTTP cache preview at `examples/diagram-design/http-cache.html` in the package as a reference. A short explanation needs only one page. Use a section for a named part of that page and a chapter for a separate topic. Do not repeat the same title as a Markdown heading.
4. Save the complete HTML as a `diagram-html` block, not a file path or Markdown fence. Use `sketchbook_write` for a new document and `sketchbook_edit` to add a block, section, or chapter to a saved book. Read the target revision before editing: `sketchbook_read` for original-page blocks or `sketchbook_read_book` for sections and chapters. On conflict or interruption, read the target again before retrying. Do not overwrite a book that the current version cannot open.
5. Call `sketchbook_open` and return the private Viewer link and saved revision. If opening is unavailable, give the document ID and revision instead. Do not put capability URLs in captures, logs, or public messages.
6. Before claiming visual review, inspect every diagram and its explanation at desktop and 390px. Check the complete heading outline and reading order, text size and wrapping at the authored scale, local overflow, and chapter and section navigation. Report storage, browser rendering, readability, source correctness, and human acceptance separately; report unverified checks as such.
