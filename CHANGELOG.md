# @narumitw/sketchbook

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
