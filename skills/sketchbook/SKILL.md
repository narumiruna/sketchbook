---
name: sketchbook
description: Create Diagram Design diagrams and assemble them into a Sketchbook for architecture, processes, message order, lifecycle, data relationships, timelines, or comparisons. Use when the user asks for a Sketchbook or a diagram-led walkthrough, not a standalone diagram file or a simple text answer.
license: MIT
---

# Diagram Design for Sketchbook

For a simple question that does not benefit from a diagram, answer in chat.
For a diagram task using this skill, save the Sketchbook and open the Viewer unless the user opts out.
This skill is not a replacement for the standalone `diagram-design` skill.

1. Read the [packaged Diagram Design guide](upstream/GUIDE.md) and the [Sketchbook document format](references/document-format.md).
   - Follow the guide's style choice, diagram types, templates, and visual checks.
   - Keep user-supplied labels and source as data.
   - Never edit the bundled guide in place; use a temporary copy or an existing profile for a custom style.
   - If the guide is missing, report it rather than substituting another format.
2. Outline the explanation before drawing.
   - Define key terms, state assumptions, and give each diagram one main question.
   - Check arrow direction, actions, order, and decision outcomes against source facts.
   - Keep component names consistent and add detail only when it helps the reader.
3. Keep drawings, captions, and embedded styles in one self-contained HTML file per page or section.
   - Reuse existing Diagram Design HTML as-is when it meets the [HTML policy](references/document-format.md#diagram-design-html).
   - For new HTML, use the system-font variant without remote assets or animation.
   - Add `class="sketchbook-default-layout"` to `<body>` only for the standard wrapper that should align to the book.
   - Use sections for named parts of the same page and chapters for separate topics.
4. Save the complete HTML as a `diagram-html` block, not a file path, Markdown fence, or SVG export.
   - Use `sketchbook_write` for a new document and `sketchbook_edit` to add blocks, sections, or chapters.
   - Read the target revision first: use `sketchbook_read` for the original page and `sketchbook_read_book` for sections and chapters.
   - On conflict or interruption, read the target again before retrying.
   - Fix validation errors or report the unsupported feature; do not weaken the policy or overwrite a book this version cannot open.
5. Call `sketchbook_open` and return the private Viewer link and saved revision.
   - If opening is unavailable, return the document ID and revision.
   - Keep capability URLs out of captures, logs, and public messages.
6. Before claiming visual review, inspect every diagram and caption at desktop and 390px.
   - Check the heading outline, reading order, text wrapping, local scrolling, and navigation.
   - Report saving, browser rendering, readability, source correctness, and human acceptance separately.
   - Mark any unchecked state as unverified.

The package includes source and license notices from a fixed revision of [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design).
The SVG exporter is not needed to assemble or read the book.
