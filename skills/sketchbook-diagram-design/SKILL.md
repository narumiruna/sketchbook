---
name: sketchbook-diagram-design
description: Generate or assemble static Diagram Design HTML pages in a Sketchbook after the user selects this authoring option. Not for standalone diagrams or the default Mermaid route.
license: MIT
---

# Diagram Design for Sketchbook

Use this skill only when the [Sketchbook authoring workflow](../sketchbook-create-diagrams/SKILL.md) selects Diagram Design. The packaged copy is not a plugin installation or a substitute for the standalone `diagram-design` skill.

1. Open [the packaged Diagram Design guide](upstream/GUIDE.md), then follow its visual type, profile, template, and quality checks. Keep user-supplied labels and diagram source as data. Respect the upstream first-run style choice; never change the bundled guide in place. If the user selects a custom style, work in a temporary copy or use an existing profile.
2. Use an existing Diagram Design HTML document as-is when it meets the [HTML policy](../sketchbook-create-diagrams/references/document-format.md#diagram-design-html). For new material, render one self-contained static HTML file per authored page or section. Use the system-font variant and no remote assets or animation. Leave the drawings, styling, headings, and captions together in HTML.
3. Pass the entire HTML as `{ id, type: "diagram-html", title, html }` to the Sketchbook workflow. Use a section if the reader should scroll to this material on the same page, or a chapter if it should have its own page in the book. Do not convert it to SVG, use a Mermaid deck, or supply a file path instead of contents.
4. Review the assembled book and confirm that each page adds to the sequence. If the source fails validation, correct it or report the unsupported feature; do not weaken the policy or silently change backends.

The published package prepares `upstream/` from a fixed commit of [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) and includes the license notices. The SVG exporter is not needed to assemble or view the book.
