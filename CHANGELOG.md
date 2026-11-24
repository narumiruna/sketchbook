# @narumitw/sketchbook

## 0.9.0

### Minor Changes

- 025e69b: Add Agentation annotations to the Viewer and a Pi-only `/sketchbook-interact` command to send feedback from a private, loopback-only Viewer directly to the current Pi conversation. Normal Viewer links remain read-only and copy-only. No additional tool or MCP configuration is required.

## 0.8.0

### Minor Changes

- f71451b: Store Pi and MCP documents in `.sketchbook/` under the selected workspace. If only a legacy `.pi/sketchbook/` or `.pi/canvas/` directory exists, Sketchbook asks you to back up and move the files manually. Document IDs, revisions, and file formats stay the same.

## 0.7.0

### Minor Changes

- 30f90ce: Breaking changes in the 0.x series: Use Diagram Design HTML for all new Sketchbook diagrams. Mermaid slides, slide focus, and the diagram-viewer camera are no longer supported. Static SVG decks, Markdown, math, code, and book navigation remain supported. The package now exposes one skill, `sketchbook`. Use `/skill:sketchbook` in Pi instead of `/skill:sketchbook-create-diagrams` or `/skill:sketchbook-diagram-design`. Sketchbook reports Mermaid content in an original page, chapter, or section without converting or deleting the source. See “Open older books” in the README to read both records with the verified recovery build.

## 0.6.0

### Minor Changes

- ff9f147: Add Diagram Design as an authoring option in the packaged skills. Compose static Diagram Design HTML into Sketchbook chapters and sections without the Mermaid diagram frame. Existing SVG slides also display as plain images.

## 0.5.0

### Minor Changes

- d081bd2: Grow a standalone page into a book without replacing its content or changing its active Viewer link. Add named sections, chapter navigation, and direct links. Use the new revision-checked `sketchbook_edit` and `sketchbook_read_book` tools in Pi and MCP to add content without resending unrelated blocks. Existing standalone documents and tools remain compatible.
- ad2e3b0: Rename the bundled skill from `sketchbook-explain-diagrams` to `sketchbook-create-diagrams`. Update explicit `/skill:` commands and saved prompts to use the new name. The skill workflow, Sketchbook tools, and saved documents are unchanged.

## 0.4.0

### Minor Changes

- 7260136: Add local Claude Code and Codex plugins that pair the bundled diagram skill with the Sketchbook MCP tools. Install the package built from the same checkout to keep the skill and server compatible.
- 3498eac: Support 18 Mermaid diagram families in Pi and MCP, including mixed diagram decks and a bundled sequence walkthrough. Flowcharts keep hand-drawn rendering and slide focus. Schema version 1 and revisions are unchanged; older readers reject newly supported headers. Diagrams still render locally without document-controlled configuration, active links, HTML labels, or external assets.
- 2bb012a: Add standalone code blocks to Pi and MCP documents. The viewer preserves the source text and supports keyboard scrolling of long lines.

### Patch Changes

- a3a7e68: Share the zoom and pan controls with diagram-viewer while preserving Sketchbook's slide focus, toolbar, full-screen view, and local Mermaid rendering.

## 0.3.0

### Minor Changes

- 188aef2: Add a standalone stdio MCP server with the three Sketchbook tools, a current-directory default and optional workspace override, shared document operations, and viewer cleanup on disconnect or signals. Keep Pi queue coordination and make the Pi peer optional for standalone installation.

### Patch Changes

- 91e6815: Keep viewer capabilities during Markdown navigation, preserve and isolate footnote targets, add keyboard diagram panning and source scrolling, recover failed artifact ignore creation, and check staged content without changing user files.

## 0.2.2

### Patch Changes

- 8b06b05: Restore direct access to diagram zoom, Reset, source view, and input help without the More controls panel. Preserve keyboard focus during source updates and keep the toolbar contained on narrow screens with enlarged text.

## 0.2.1

### Patch Changes

- 3757097: Require source-based diagram and cross-deck contribution review in the bundled skill.
  Update teaching examples to show decision inputs, rejection effects, and caller handoffs.
  Place explanations beside diagrams on wide screens and simplify narrow-screen headings.
  Group secondary diagram controls in an accessible disclosure and label slide navigation.
  Preserve existing document, camera, access, and fullscreen contracts.

## 0.2.0

### Minor Changes

- 3f65e9c: Enable automatic LAN viewer access without host flags.
  Bind to all IPv4 interfaces and return a detected private IPv4 URL, with a loopback URL fallback.
  Keep capability-token, matching Host/Origin, read-only, and session-shutdown checks.
  Use only trusted networks: HTTP is unencrypted, and the listener is not restricted to LAN clients.

## 0.1.1

### Patch Changes

- 35ddef1: Fix article heading hierarchy and size inline diagram frames to their content.
  Review complete article outlines before slide continuity, and verify every example slide at desktop and narrow widths.

## 0.1.0

### Minor Changes

- 9c3a9ce: Add a compact diagram frame with zoom, fit, native-size reset, drag and modified-wheel controls, source view, and fullscreen. Move slide navigation below the graph and remove repeated slide titles.
- 3b3bf87: Add a local Pi Sketchbook extension and skill for versioned Mermaid walkthroughs with Markdown, LaTeX, code blocks, and independent hand-drawn diagram decks.
- 3b3bf87: Rename the project and npm package to Pi Sketchbook (`pi-sketchbook`).
  Use the `sketchbook_write`, `sketchbook_read`, and `sketchbook_open` tools and the `sketchbook-explain-diagrams` skill.
  Store new documents in `.pi/sketchbook/`; existing documents are not moved automatically.
  See the README upgrade instructions before moving saved documents or updating integrations.

### Patch Changes

- 469f37b: Add side-arrow controls and clickable slide-position dots while preserving keyboard navigation and single-slide behavior.
