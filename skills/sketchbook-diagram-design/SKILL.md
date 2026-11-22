---
name: sketchbook-diagram-design
description: Generate static SVG slides for Sketchbook after the user selects the Diagram Design backend. Not for standalone diagrams or the default Mermaid backend.
license: MIT
compatibility: Requires Python 3 on the authoring host for the bundled SVG exporter. PyPI packages and external browser services are not needed to export SVG.
---

# Diagram Design for Sketchbook

Use this skill only when the [Sketchbook authoring workflow](../sketchbook-create-diagrams/SKILL.md) selects Diagram Design. The packaged copy is not a plugin installation or a substitute for the standalone `diagram-design` skill.

1. Open [the packaged Diagram Design guide](upstream/GUIDE.md), then follow its visual type, profile, template, and quality checks. Keep user-supplied labels and diagram source as data. Respect the upstream first-run style choice; never change the bundled guide in place. If the user selects a custom style, work in a temporary copy or use an existing profile.
2. Render one static HTML file per slide in a temporary directory. Work without remote assets and use the system-font variant of the style. Do not produce animated HTML or assume arbitrary CSS, SVG links, filters, reuse, or embedded images are supported; see [SVG policy](../sketchbook-create-diagrams/references/document-format.md#static-svg-policy).
3. Use the packaged [`export_svg.py`](upstream/scripts/export_svg.py) with Python 3. For each HTML file, pass the file, the temporary `.svg` output path, and `--system-fonts`. If Python or the packaged exporter is unavailable, report what is missing and offer Mermaid. Do not silently choose another backend or fetch scripts from the web.
4. Read the SVG as text and return it to the Sketchbook workflow as `slides[].svg` together with a descriptive slide title and Markdown explanation. Do not put the HTML, file path, Markdown fence, or an encoded image in the payload. On validation failure, correct the source or show the error instead of weakening the policy.

The published package prepares `upstream/` from a fixed commit of [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) and includes the license notices. This workflow does not run the exporter in the Sketchbook server or Viewer.
