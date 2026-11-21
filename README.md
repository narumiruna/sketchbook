# Pi Sketchbook

Pi Sketchbook provides Pi tools and a standalone MCP server for local technical documents with Markdown, LaTeX, code, and Mermaid diagram decks. Start with one page and add sections or chapters when readers need more detail. Flowcharts use a hand-drawn style.
Each deck shows one diagram and its explanation at a time, independently of chapter navigation.
Review the complete article outline before reviewing its decks.
Build each deck around one question: each slide must connect to the established context and add useful information.
Define required terms before use, remove repeated prose, and conclude each main topic.
Keep repeated component names and meanings consistent; put independent questions in separate decks.
Use the bottom Previous/Next buttons or labelled position dots to change slides; focused decks also support Left/Right keyboard keys.
On wide screens, explanations appear beside their diagrams; narrower screens use one reading column.
The page title is H1. Outside named sections, deck titles are H2 and current slide titles are H3. Inside a named section, they are H3 and H4.
Matching deck and slide titles appear once visually.

## Installation

### Pi

Install the published Pi package from npm:

```sh
pi install npm:@narumitw/sketchbook
```

This installs the published version, which can lag behind this repository.
To use the latest changes from this checkout, use Node.js 26.0.0 or later and run:

```sh
npm ci
npm run build
pi install ./
```

Sketchbook tests against Pi 1.6.0; see [compatibility evidence](docs/compatibility.md).

Local installation requires the built `dist` assets and installed dependencies.
Git-source installation is not supported in this release.

The release workflow creates version tags and GitHub Releases. It does not publish npm packages.
Review package code before installation and project declarations before granting Pi project trust.

### Claude Code and Codex plugins

Install the plugin to get `sketchbook-create-diagrams` and its MCP tools together. The plugins are for local clients; they use the same `sketchbook-mcp` executable.

Build and install the npm tarball from this checkout with Node.js 26.0.0 or later. This keeps the skill and MCP server on the same version. Run these commands at the repository root:

```sh
npm ci
npm run build
archive=$(npm pack --quiet --ignore-scripts)
npm install --global "./$archive"
plugin_root="$(npm root --global)/@narumitw/sketchbook"
```

Make sure `sketchbook-mcp --help` works in the shell that starts your client. Register the plugin for either client using the `plugin_root` value above:

```sh
# Claude Code
claude plugin marketplace add "$plugin_root"
claude plugin install sketchbook@narumi-sketchbook

# Codex CLI
codex plugin marketplace add "$plugin_root"
codex plugin add sketchbook@narumi-sketchbook
```

Start a new client session from the workspace where you want to keep your documents. Claude Code uses the project root; Codex uses the server's working directory, inherited from the CLI session in the tested local setup. Both save to that workspace's `.pi/sketchbook/` directory. If you already configured the standalone MCP server, remove the duplicate entry before using the plugin.

### MCP

For a server without the bundled skill, configure MCP directly.
The stdio MCP server exposes the same Sketchbook tools as Pi to clients such as Claude Desktop and Cursor. It does not require Pi. The installed package version determines which tools are available.
Run the published package from your workspace:

```sh
npx -y @narumitw/sketchbook --cwd .
```

Or add the server to your client's MCP configuration. Replace `/absolute/path/to/workspace` with the workspace where Sketchbook should save documents:

```json
{
  "mcpServers": {
    "sketchbook": {
      "command": "npx",
      "args": ["-y", "@narumitw/sketchbook", "--cwd", "/absolute/path/to/workspace"]
    }
  }
}
```

Use the client's MCP settings file, such as Claude Desktop's `claude_desktop_config.json` or Cursor's `.cursor/mcp.json`.
Restart the client after changing its configuration.
To use a fixed package version, replace `@narumitw/sketchbook` with `@narumitw/sketchbook@<version>`.
To run the MCP server from this checkout, use Node.js 26.0.0 or later, run `npm ci` and `npm run build`, then launch `node /absolute/path/to/sketchbook/dist/mcp-cli.js --cwd /absolute/path/to/workspace`.

#### MCP workspace and behavior

- `--cwd` names an existing workspace directory. Published version `0.2.2` requires it; the current checkout defaults to the server process's working directory when it is omitted.
  - Relative paths are resolved from the process working directory.
  - In a terminal, the default is the shell's current directory. An MCP client chooses the directory when it starts the server; this is not necessarily the project open in the client.
  - Documents stay in that workspace's `.pi/sketchbook/` directory, using the same format as Pi.
  - Tool inputs cannot change the workspace. Use a separate server configuration for another workspace.
  - Do not write the same document from different Pi or MCP processes at the same time.
- The server uses stdio only; stdout is reserved for MCP messages and diagnostics use stderr.
  - Each tool returns JSON text and `structuredContent`; failures also set `isError: true`.
  - Unlike Pi's bounded read text, MCP's `sketchbook_read` includes the complete stored document in both result channels.
  - Create without `documentId` and `expectedRevision`. For a full-page replacement, read first and submit both fields with the complete document. For a local edit, use `sketchbook_edit`.
- `sketchbook_open` starts the existing read-only HTTP viewer, not an HTTP MCP endpoint.
  - It returns a URL without opening a browser. Saving and opening do not verify browser rendering.
  - The viewer binds to all IPv4 interfaces and requires a trusted network; the [LAN rules](#lan-access) also apply to MCP.
  - Keep the complete capability URL private. It permits reads within the viewer workspace.
  - Client disconnect, stdin EOF, SIGINT, or SIGTERM closes the viewer. Restarting requires a new URL; saved files remain.
- MCP exposes tools, not Pi slash commands or automatic skill loading.
  - The bundled [authoring skill](skills/sketchbook-create-diagrams/SKILL.md) and [document format](skills/sketchbook-create-diagrams/references/document-format.md) remain available as guidance.
  - Client-specific UI behavior still requires the [MCP client handoff](docs/acceptance.md#mcp-client-handoff).

## Upgrade from Pi Canvas

The package is now `@narumitw/sketchbook`.
Replace `canvas_*` tool calls with `sketchbook_*` and `/skill:canvas-explain-diagrams` with `/skill:sketchbook-create-diagrams`.
The old names are not aliases.

Existing documents in `.pi/canvas/` are not moved automatically.
Stop all Pi sessions that use the workspace and back up the saved documents before moving them.
If `.pi/sketchbook/` does not exist, move the complete `.pi/canvas/` directory to `.pi/sketchbook/`.
If both directories exist, keep both and resolve document ID conflicts before moving files; do not overwrite either directory.
Document IDs, revisions, and schema version 1 remain unchanged.
Start Pi again to load the renamed tools and skill, then open documents for new viewer URLs.

## Use

If you used `/skill:sketchbook-explain-diagrams`, update your prompts and integrations to use `/skill:sketchbook-create-diagrams`. The old command is not an alias.

Load the bundled skill explicitly:

```text
/skill:sketchbook-create-diagrams Explain this system with an overview, API detail, and storage detail.
```

For a quick overview, answer in chat first: state what the subject does and list its main features. Save a page only when requested or when a visual helps.
When the skill handles a diagram request, it saves the page, opens the local Viewer, and returns its link by default. You do not need to ask separately for a link.
The skill chooses from the [supported diagram families](#supported-mermaid-diagrams) based on the question: for example, a state diagram for lifecycle changes or an XY chart for numeric trends.
Simple questions that do not benefit from diagrams should not trigger the skill automatically.
Automatic skill selection remains unverified.
The skill includes complete [architecture](skills/sketchbook-create-diagrams/assets/architecture-walkthrough.json), [process](skills/sketchbook-create-diagrams/assets/process-walkthrough.json), and [sequence](skills/sketchbook-create-diagrams/assets/sequence-walkthrough.json) examples.

| Tool                   | Input and result                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `sketchbook_write`     | `{document}` creates a document and returns its ID, revision, storage path, summary, and rendering-unverified status.                           |
| `sketchbook_read`      | `{documentId}` returns `{documentId, revision, updatedAt, document}` in `structuredContent.stored`.                                             |
| `sketchbook_write`     | `{document, documentId, expectedRevision}` replaces the full original document if the revision matches.                                         |
| `sketchbook_open`      | `{documentId}` returns an ephemeral local Viewer URL; it does not launch a browser.                                                             |
| `sketchbook_read_book` | `{documentId}` returns `{ok: true, book: StoredBook \| null, contentTruncated}`. `null` means no sidecar; its initial revision is `0`.          |
| `sketchbook_edit`      | `{documentId, expectedRevision, operation}` returns `{ok: true, documentId, revision, record: 'document' \| 'book', renderingVerified: false}`. |

For edits, read the record you intend to change and use its revision. On conflict or an uncertain result, read that same record again before deciding whether to retry.
A successful write confirms validation and storage, not browser rendering.
Pi and MCP apply the same Mermaid header and source checks and preserve the exact source. The Viewer parses the diagram body in the browser.
The [document format](skills/sketchbook-create-diagrams/references/document-format.md) defines fields, IDs, limits, heading roles, and tool details.

For a standalone snippet, add an entry like this to `document.blocks`:

```json
{ "id": "example", "type": "code", "language": "TypeScript", "code": "const answer = 42;\n" }
```

Omit `language` to hide the label.
The viewer displays the code as text without executing it.
Focus the block with Tab and use the arrow keys to scroll long lines.
Use Markdown fences instead for snippets inside prose or slide explanations.

### Grow a page into a book

A standalone page needs no cover or contents list. Add a section to give readers a named position on that page. Add a chapter when a topic needs its own scrollable page. Only adding another chapter turns the original page into the first chapter of a book. The original title, content, ID, and open link stay in place.

1. Use `sketchbook_read_book` before `add-section` or `add-chapter`. If `book` is `null`, pass `expectedRevision: 0` to the first edit. Read the book again or use its returned revision for the next book edit.
2. Use `sketchbook_edit` to append a block or slide to its target without resending unrelated content. Use `replace-block` for an explicit replacement. Without `chapterId`, the edit addresses the first chapter. A block or slide edit with neither `chapterId` nor `sectionId` changes the original document and uses the revision from `sketchbook_read`. Every other operation changes the book sidecar and uses its revision. The two revisions are independent; neither is a snapshot of both records.
3. Use the Viewer’s numbered book contents to switch chapters, or Previous/Next to read in order. Section links appear under the current chapter; select one to jump within that page. For a page with sections but no other chapters, the contents list only those sections. On wide screens the contents stay visible in a left sidebar; on narrow screens they appear above the reading page. A chapter or section link uses `chapter` and/or `section` query parameters with stable IDs. Keep the original token in the URL fragment, after the query. An unqualified link still opens the first chapter; renaming or reordering a chapter does not change its ID. Links remain private and valid only for the running Viewer session.

See [edit operations and targeting](skills/sketchbook-create-diagrams/references/document-format.md#edit-operations) for exact fields and [progressive acceptance](docs/acceptance.md#progressive-sketchbook-handoff) for the verification handoff.

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

- Start chapter introduction Markdown headings at H2 and section Markdown headings at H3. Do not repeat the page or section title in Markdown.
  - Legacy Markdown blocks with H1 are shifted down when rendered; saved JSON is unchanged.
  - Keep explanation headings subordinate to their slide.
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

## Supported Mermaid diagrams

Use a `diagram-deck` even for one diagram. Slides in one deck can use different families. Put plain Mermaid source in `slides[].mermaid`, not a Markdown fence. Use one of these headers from the pinned Mermaid 12.3.0 release:

| Family              | Accepted headers                                                       |
| ------------------- | ---------------------------------------------------------------------- |
| Flowchart           | `flowchart`, `graph`                                                   |
| Sequence            | `sequenceDiagram`                                                      |
| Class               | `classDiagram`                                                         |
| State               | `stateDiagram-v2`, `stateDiagram`                                      |
| Entity relationship | `erDiagram`                                                            |
| User journey        | `journey`                                                              |
| Gantt               | `gantt`                                                                |
| Pie                 | `pie`                                                                  |
| Git graph           | `gitGraph`                                                             |
| Requirement         | `requirementDiagram`                                                   |
| Timeline            | `timeline`                                                             |
| Quadrant chart      | `quadrantChart`                                                        |
| Kanban              | `kanban`                                                               |
| Block               | `block`                                                                |
| Packet              | `packet`                                                               |
| Sankey              | `sankey`                                                               |
| XY chart            | `xychart`                                                              |
| C4                  | `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment` |

Flowcharts, including subgraphs, keep the hand-drawn Rough.js style with a fixed nonzero seed and a muted blue-gray default palette. Other families use Mermaid's normal style. The diagram skill omits `focusNodes` by default. Use it only on a flowchart detail slide that needs to zoom into a region of the overview.

Not supported:

- Beta-only families: Architecture, Agentflow, Swimlanes, TreeView, Radar, Ishikawa, Venn, Wardley, Cynefin, Use Case, Treemap, and the four Railroad forms.
- Experimental Mindmap, Event Modeling (the pinned renderer needs HTML for its event labels), and ZenUML (requires a plugin).
- Headers outside the table, including `flowchart-elk`, `xychart-beta`, `classDiagram-v2`, bare `requirement`, the `info` version display, and internal `error` and `---` entries. Parser acceptance does not add a header to this list.
- PlantUML, Graphviz, raw SVG, and other diagram formats.

### Downgrade without losing source

The original page stays schema version 1. A version without book support can still open a compatible original page, but will not show its sidecar content. Keep both files to recover that content in a book-aware build. Older versions that accept only `flowchart` reject a page that uses a newer header, including `graph`. Back up both records, leave the source unchanged, and use a compatible reader to copy Mermaid source if needed.

## Rendering and security

- Support for a Mermaid family does not enable all of its syntax.
  - Use plain text labels. Do not use frontmatter, configuration directives, node metadata (`@{...}`), click actions or other interactive links, HTML, images, icons, external resources, or custom plugins.
  - Use simple declarations for supported styling statements. Custom CSS rules and C4 style update commands are not supported.
  - The viewer checks source before rendering, runs Mermaid in strict mode without HTML labels or diagram event bindings, and sanitizes generated SVG. SVG definition references must stay within that diagram.
  - Diagrams start fitted without upscaling; inline frame height follows the SVG aspect ratio and available width, within a bounded height.
  - Fit can still make large diagrams small. Rework a teaching diagram that is unreadable at its default scale; Reset, Zoom, and panning remain available for inspecting large diagrams.
- Markdown supports inline/display LaTeX, fenced code, and footnotes, but not raw HTML or images.
  - Footnote targets are local to each Markdown block or slide explanation.
  - In-page links move focus without replacing the viewer token, so the current URL remains valid after navigation.
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
Changing slides restores the diagram view.

- **Fit to screen** shows the complete graph. **Reset zoom** restores 100% native size on slides without a focus region.
- Flowchart architecture decks start with a full overview and no frame. Flowchart detail slides can open zoomed in on a single blue, lightly hatched focus region on the same graph.
  - In forced-colors mode, a dashed system-color border identifies the focus region without shading.
  - **Fit to screen** shows the complete graph without removing the current frame. **Reset to slide focus** returns to that detail view.
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

The workspace stores the original page at `.pi/sketchbook/<documentId>.json` and, if present, its sections and additional chapters at `.pi/sketchbook/<documentId>.book.json`. No migration is needed. A legacy full replacement changes only the original page; it leaves the sidecar intact.
Only `.pi/sketchbook/.gitignore` is created for local artifact exclusions; the root `.gitignore` is not changed.
Writes use revision checks, a same-process mutation queue per record, and atomic rename. There is no cross-process lock or transaction spanning both records. Do not write the same document from multiple Pi or MCP processes.

Only `sketchbook_open` starts the viewer server.
Pi TUI and RPC sessions can open it; Pi print and JSON modes can read and write records but cannot open the Viewer.
The MCP server can keep the viewer running until the client disconnects or the process stops.
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

The pre-commit hook checks a temporary copy of staged content. Biome uses the staged configuration and ignore rules; the comment check uses [the staged baseline](scripts/comment-baseline.json).
The comment check covers tracked JavaScript, TypeScript, CSS, HTML, YAML, JSONC (including TypeScript configurations), shell scripts, and Husky hooks. Markdown and comment-like text inside strings and fixture data are not source comments.

- Keep required notices, tool directives, and JSDoc for exported declarations in `src/`.
- Do not add, edit, duplicate, or move other comments to a different file. Record design rationale in [decision records](docs/decisions/) and workarounds in issues or [issue drafts](docs/follow-ups.md).
- When removing a retained comment, delete its exact entry from the baseline in the same commit. Remove the path key if its list becomes empty. The baseline cannot grow or accept replacement entries.

The hook does not change the working tree or index. Correct reported issues and stage only the intended changes before retrying.

On a fresh Linux system, use `npx playwright install --with-deps chromium` if browser system libraries are missing.
The explicit browser output directory preserves separate review captures under `test-results/`.
For controlled before/after layout captures, run `npx tsx scripts/capture-reading-layout.ts baseline` before UI edits and `npx tsx scripts/capture-reading-layout.ts after` after rebuilding.
The capture script uses a temporary workspace, not saved user documents, and retains no capability URLs.

See [compatibility evidence](docs/compatibility.md) for measured results and [acceptance](docs/acceptance.md) for human checks, future authorized model tests, and release-owner actions.
Automated checks do not establish visual acceptance or reliable automatic skill loading.

## Scope and license

Sketchbook does not provide cloud sharing, accounts, live collaboration, browser editing, nested chapters or sections, version history, restore, autoplay, export, or HTTP MCP transport.
See [LICENSE](LICENSE) for the GNU Affero General Public License, version 3.
