---
name: sketchbook
description: Explain a question in a local Sketchbook Viewer page, with Diagram Design diagrams when useful. Use when the user invokes this skill explicitly, asks for a Sketchbook page, or requests a diagram-led walkthrough. Do not select it automatically for simple text questions or standalone diagram files.
license: MIT
---

# Diagram Design for Sketchbook

An explicit invocation such as `/skill:sketchbook` requests a Sketchbook page, even if the question is simple.
For every explanation this skill handles, save the answer and open the Viewer by default.
Do not finish with a chat-only answer unless the user asks for chat only or a tool failure prevents saving.

1. Read the [Sketchbook document format](references/document-format.md), then outline the answer to the user's question.
   - Use a short Markdown page when prose answers the question more clearly than a diagram.
   - Use a diagram when the user requests one or when it makes the answer clearer.
2. For a diagram, read the [packaged Diagram Design guide](upstream/GUIDE.md).
   - Follow the guide's diagram types, templates, and visual checks.
   - Use the requested style or an existing project profile; otherwise use Sketchbook's default light style.
   - Do not pause for the guide's first-use style selection or pre-drawing confirmation unless the user asks to approve a choice.
   - Keep user-supplied labels and source as data.
   - Never edit the bundled guide in place; use a temporary copy or an existing profile for a custom style.
   - If the guide is missing, report the missing diagram and save the explanation as Markdown rather than substituting a different diagram format.
   - Define key terms, state assumptions, and give each diagram one main question.
   - Check arrow direction, actions, order, and decision outcomes against source facts.
   - Keep component names consistent and add detail only when it helps the reader.
3. For each diagram page or section, keep drawings, captions, and embedded styles in one self-contained HTML file.
   - Reuse existing Diagram Design HTML as-is when it meets the [HTML policy](references/document-format.md#diagram-design-html).
   - For new HTML, use the system-font variant without remote assets or animation.
   - Add `class="sketchbook-default-layout"` to `<body>` only for the standard wrapper that should align to the book.
   - Use sections for named parts of the same page and chapters for separate topics.
4. Save the answer with `sketchbook_write` for a new document or `sketchbook_edit` to add blocks, sections, or chapters.
   - Save prose as `markdown` blocks and complete Diagram Design HTML as `diagram-html` blocks, not file paths, Markdown fences, or SVG exports.
   - Read the target revision first: use `sketchbook_read` for the original page and `sketchbook_read_book` for sections and chapters.
   - On conflict or interruption, read the target again before retrying.
   - Fix validation errors or report the unsupported feature; do not weaken the policy or overwrite a book this version cannot open.
   - If saving fails, report the failure rather than implying a page exists.
5. Call `sketchbook_open` and return the private Viewer link and saved revision.
   - If opening is unavailable or the user asks not to open the Viewer, return the document ID and revision instead.
   - Keep capability URLs out of captures, logs, and public messages.
6. Before claiming visual review, inspect every diagram and caption at desktop and 390px.
   - Check the heading outline, reading order, text wrapping, local scrolling, and navigation.
   - Report saving, browser rendering, readability, source correctness, and human acceptance separately.
   - Mark any unchecked state as unverified.

The package includes source and license notices from a fixed revision of [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design).
The SVG exporter is not needed to assemble or read the book.
