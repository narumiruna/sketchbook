# Pi Sketchbook

Pi Sketchbook is a Pi package for local technical documents with Markdown, LaTeX, code, and hand-drawn Mermaid diagram decks.
Each deck shows one diagram and its explanation at a time.
Review the complete article outline before reviewing its decks.
Build each deck around one question: each slide must connect to the established context and add useful information.
Define required terms before use, remove repeated prose, and conclude each main topic.
Keep repeated component names and meanings consistent; put independent questions in separate decks.
Use the bottom Previous/Next buttons or labelled position dots to change slides; focused decks also support Left/Right keyboard keys.
On wide screens, explanations appear beside their diagrams; narrower screens use one reading column.
The document title is the page H1, each deck has a stable H2 chapter title, and its current slide uses H3.
Matching deck and slide titles appear once visually.

## Install

Use Node.js 22.19 or later.
Pi 1.5.0 is tested with Node.js 22.19.0 and 26.8.2; see [compatibility evidence](docs/compatibility.md).

Build and install this checkout:

```sh
npm ci
npm run build
pi install ./
```

Local installation requires the built `dist` assets and installed dependencies.
Git-source installation is not supported in this release.

The release workflow creates version tags and GitHub Releases without publishing packages to npmjs.
Use the local installation steps above.
Review package code before installation and project declarations before granting Pi project trust.

## Upgrade from Pi Canvas

The package is now `sketchbook`.
Replace `canvas_*` tool calls with `sketchbook_*` and `/skill:canvas-explain-diagrams` with `/skill:sketchbook-explain-diagrams`.
The old names are not aliases.

Existing documents in `.pi/canvas/` are not moved automatically.
Stop all Pi sessions that use the workspace and back up the saved documents before moving them.
If `.pi/sketchbook/` does not exist, move the complete `.pi/canvas/` directory to `.pi/sketchbook/`.
If both directories exist, keep both and resolve document ID conflicts before moving files; do not overwrite either directory.
Document IDs, revisions, and schema version 1 remain unchanged.
Start Pi again to load the renamed tools and skill, then open documents for new viewer URLs.

## Use

Load the bundled skill explicitly:

```text
/skill:sketchbook-explain-diagrams Explain this system with an overview, API detail, and storage detail.
```

Automatic skill selection is not guaranteed.
The skill includes complete [architecture](skills/sketchbook-explain-diagrams/assets/architecture-walkthrough.json) and [process](skills/sketchbook-explain-diagrams/assets/process-walkthrough.json) examples.

| Tool               | Input and result                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `sketchbook_write` | `{document}` creates a document and returns its ID, revision, storage path, summary, and rendering-unverified status. |
| `sketchbook_read`  | `{documentId}` returns `{documentId, revision, updatedAt, document}` in `structuredContent.stored`.                   |
| `sketchbook_write` | `{document, documentId, expectedRevision}` replaces the full document if the revision matches.                        |
| `sketchbook_open`  | `{documentId}` returns an ephemeral local viewer URL; it does not launch a browser.                                   |

For updates, read first and use the returned revision.
On conflict, read again and apply the change to the current document.
A successful write confirms validation and storage, not browser rendering.
The [document format](skills/sketchbook-explain-diagrams/references/document-format.md) defines fields, IDs, limits, heading roles, and tool details.

### LAN access

Call `sketchbook_open` and use its complete returned URL on a device on the same trusted LAN.
No manual IP entry, host flag, or network configuration is required in Pi Sketchbook.
After changing this checkout, run `npm run build`, use `/reload` in Pi, and reopen the document.

- The viewer listens on `0.0.0.0` on a random port.
  - This opens every IPv4 interface, not just the LAN; Host checks are not client-IP filtering.
  - The returned URL uses the first detected non-internal private IPv4 address in operating-system interface order.
  - Private addresses are in `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`.
  - If none is detected, the URL uses `127.0.0.1`; the listener still uses `0.0.0.0`.
  - `0.0.0.0` is a bind address, not the address another device opens. IPv6 is not supported.
- Requests must use a detected private address or `127.0.0.1` with the exact viewer port.
  - If an Origin header is present, it must match that request's allowed Host.
  - Wildcard, public-address, hostname, and unassigned-address Host values are rejected.
- HTTP is unencrypted.
  - Use only trusted networks and operating-system firewall policy; do not expose or forward the port to the Internet.
  - Keep secrets out of documents and keep the full URL private.
  - Its fragment token permits document reads within that viewer's workspace, not only the linked document.
- VPNs or virtual interfaces can affect which private address is detected first.
  - Automatic selection does not prove that a second device can reach that address.
  - Firewall policy or Wi-Fi client isolation can also block access; Pi Sketchbook does not change either.
  - See the [LAN device handoff](docs/acceptance.md#lan-device-handoff) for the remaining checks.

Addresses are captured when the listener starts.
If the network or DHCP address changes, reload Pi and open a fresh URL.
Stop the Pi session to close the listener and invalidate its capability; no document migration is required.

### Article review

- Start article Markdown headings at H2; do not repeat the document title.
  - Legacy Markdown blocks with H1 are shifted down one heading level when rendered; saved JSON is unchanged.
  - Explanation headings are placed below the slide H3, starting at H4.
- Review the complete heading outline, concept order, first definitions, repeated text, and conclusion before checking slide transitions.
  - Check every arrow's sender, receiver, action, direction, and required order against sources or explicit teaching facts.
  - Make important decision inputs, outcomes, and write/no-write effects visible in the graph.
  - Compare slide contributions across decks; a new title does not make a repeated explanation useful.
  - Keep a compact source/contribution/issues review record outside the document payload.
- Inspect the full page and every slide at desktop and 390-pixel widths before claiming visual review.
  - Check default Fit label size, unused frame space, text wrapping, emphasis, and diagram meaning.
  - Report saving, rendering, readability, content correctness, and human acceptance separately.
  - Rendering and minimum label sizes are prerequisites, not proof of explanation quality or comfortable reading.
- Use short labels and compact graphs that can be read without Reset or Zoom.
  - Long-label and large-graph stress tests do not define suitable teaching layouts.

## Rendering and security

- Only Mermaid `flowchart` diagrams are supported, including subgraphs.
  - The viewer uses Mermaid's `handDrawn` look through Rough.js with a fixed nonzero seed.
  - Frontmatter, directives, node metadata (`@{...}`), click actions, HTML, images, and icons are not supported.
  - Diagrams start fitted without upscaling; inline frame height follows the SVG aspect ratio and available width, within a bounded height.
  - Fit can still make large graphs small. Rework a teaching graph that is unreadable at its default scale; Reset, Zoom, and panning remain available for inspecting large graphs.
- Markdown supports inline/display LaTeX, fenced code, and footnotes, but not raw HTML or images.
  - Footnote targets are local to each Markdown block or slide explanation.
  - In-page links move focus without replacing the viewer token, so the current URL remains valid after navigation.
  - Mermaid uses strict security and disables HTML labels; generated SVG is sanitized.
  - KaTeX uses `trust: false`, `maxExpand: 1000`, and `maxSize: 20`.
- Viewer scripts, styles, fonts, and renderers are bundled; no CDN is required.
- The read-only server binds to `0.0.0.0` on an ephemeral port and automatically returns a private IPv4 URL, with a loopback URL fallback.
  - LAN access retains token validation and exact per-request Host/Origin checks; it requires a trusted network.
  - Data requests require a per-server capability token carried by the viewer URL fragment.
  - Host validation, same-origin access, and CSP limit browser access.
  - Treat the full viewer URL as private and keep secrets out of documents.
- A parse error is shown locally with source details instead of removing the rest of the document.
  - Rendering runs on the browser main thread; error handling is not CPU isolation.

## Diagram controls

The toolbar directly shows Fit to screen, Fullscreen, Zoom out, current zoom, Zoom in, Reset zoom, and Show source.
Input-specific help remains visible below the buttons; no More controls panel is used.
Enabled controls are available in the keyboard tab order.
Hover or focus an icon button to show its label.
Show source displays inert text, not executable HTML. Tab to the source region and use the arrow or Page Up/Page Down keys to scroll it, including in fullscreen.
A new diagram source restores the diagram view.

- Fit shows the complete graph; Reset restores 100% native size.
- Zoom is limited to 400%; the lower limit is 25% or the fitted scale when smaller.
- Drag with a mouse or pen to pan a large graph.
  - Ctrl/Command + wheel zooms at the pointer; an ordinary wheel continues document scrolling.
  - Inline touch gestures remain available for document scrolling; touch panning and pinch zoom are not implemented.
  - Coarse-pointer help describes control-based zoom and article scrolling, not mouse-wheel gestures.
- Focus the diagram viewport to use `+`/`-` to zoom and `0` to fit.
  - Shift + arrow keys pan the diagram at the current zoom.
  - Unmodified Left/Right keys still switch slides in the focused deck.
- Fullscreen uses the browser API or an in-page fallback.
  - Exit restores focus; Escape closes the fallback.
  - Changing the diagram source or removing its block closes fullscreen and releases background locks.

## Files and lifecycle

Documents are stored in the Pi working directory at `.pi/sketchbook/<documentId>.json`.
Only `.pi/sketchbook/.gitignore` is created for local artifact exclusions; the root `.gitignore` is not changed.
Writes use complete replacement, revision checks, a same-process mutation queue, and atomic rename.
Do not write the same document from multiple Pi processes.

Only `sketchbook_open` starts the viewer server.
TUI and RPC sessions can open it; print and JSON modes support write/read only.
Shutdown closes the server but does not remove documents.
After reload, new, resume, or fork, open again for a current URL.
Tree navigation and session branching do not restore disk documents; read and create a new ID for a separate document branch.
Physical second-device LAN access, remote SSH, container forwarding, and WSLg/Windows browser access need environment-specific verification.

## Verify

```sh
npm run ci
npx playwright install chromium
npm run test:browser -- --output=test-results/browser
npm pack --dry-run
npm run test:package
```

The pre-commit hook checks a temporary copy of the staged content with its staged Biome configuration and ignore rules.
It does not change the working tree or index. Correct reported issues and stage only the intended changes before retrying.

On a fresh Linux system, use `npx playwright install --with-deps chromium` if browser system libraries are missing.
The explicit browser output directory preserves separate review captures under `test-results/`.
For controlled before/after layout captures, run `npx tsx scripts/capture-reading-layout.ts baseline` before UI edits and `npx tsx scripts/capture-reading-layout.ts after` after rebuilding.
The capture script uses a temporary workspace, not saved user documents, and retains no capability URLs.

See [compatibility evidence](docs/compatibility.md) for measured results and [acceptance](docs/acceptance.md) for human checks, future authorized model tests, and release-owner actions.
Automated checks do not establish visual acceptance or reliable automatic skill loading.

## Scope and license

This release does not provide cloud sharing, accounts, collaboration, browser editing, autoplay, export, partial updates, a standalone persistent server, or arbitrary Mermaid types and external assets.
See [LICENSE](LICENSE) for the GNU Affero General Public License, version 3.
