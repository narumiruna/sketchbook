# Sketchbook

Sketchbook provides Pi tools and a standalone MCP server for local technical documents with Markdown, LaTeX, code, and Diagram Design HTML. Existing static SVG decks still work. Start with one page and add sections or chapters when readers need more detail.
Each deck shows one diagram and its explanation at a time, independently of chapter navigation.
Use the bottom Previous/Next buttons or labelled position dots to change slides; focused decks also support Left/Right keyboard keys.
On wide screens, explanations appear beside their diagrams; narrower screens use one reading column.
The page title is H1. Outside named sections, deck titles are H2 and current slide titles are H3. Inside a named section, they are H3 and H4.
Matching deck and slide titles appear once visually.

## Installation

### Pi

Install the latest Sketchbook from GitHub:

```sh
pi install https://github.com/narumiruna/sketchbook
```

The Git install uses Node.js 26.0.0 or later, Git, `tar`, and Pi's default package manager (`npm`).
Pi clones the repository and builds the extension, Viewer, and bundled skill during installation and when an update changes the Git commit. The build needs access to npm and GitHub.
Restart Pi or use `/reload`, then run `/skill:sketchbook`.

To update the Git installation, run `pi update https://github.com/narumiruna/sketchbook`.

You can also install the prebuilt npm package, which can lag behind this repository:

```sh
pi install npm:@narumitw/sketchbook
```

If you switch sources, remove the old package first with `pi remove <source>` to avoid loading Sketchbook twice.
To install from a local checkout for development:

```sh
npm ci
npm run build
pi install ./
```

Sketchbook tests against Pi 1.6.0; see [compatibility evidence](docs/compatibility.md).

Local installation requires Node.js 26.0.0 or later, the built `dist` assets, and installed dependencies.

The release workflow creates version tags and GitHub Releases. It does not publish npm packages.
Review package code before installation and project declarations before granting Pi project trust.

### Claude Code and Codex plugins

Install the plugin to get the `sketchbook` skill and its MCP tools together. The plugins are for local clients; they use the same `sketchbook-mcp` executable.

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
  - See [Files and lifecycle](#files-and-lifecycle) for limits on concurrent writes.
- The server uses stdio only; stdout is reserved for MCP messages and diagnostics use stderr.
  - Each tool returns JSON text and `structuredContent`; failures also set `isError: true`.
  - Unlike Pi's bounded read text, MCP's `sketchbook_read` includes the complete stored document in both result channels.
  - Create without `documentId` and `expectedRevision`. For a full-page replacement, read first and submit both fields with the complete document. For a local edit, use `sketchbook_edit`.
- `sketchbook_open` starts the read-only HTTP viewer, not an HTTP MCP endpoint. The [LAN rules](#lan-access) also apply to MCP.
  - Client disconnect, stdin EOF, SIGINT, or SIGTERM closes the viewer.
- MCP exposes tools, not Pi slash commands or automatic skill loading.
  - The bundled [authoring skill](skills/sketchbook/SKILL.md) and [document format](skills/sketchbook/references/document-format.md) remain available as guidance.
  - Client-specific UI behavior still requires the [MCP client handoff](docs/acceptance.md#mcp-client-handoff).

## Upgrade from Pi Canvas

The package is now `@narumitw/sketchbook`.
Replace `canvas_*` tool calls with `sketchbook_*` and `/skill:canvas-explain-diagrams` with `/skill:sketchbook`.
The old names are not aliases.

Existing documents in `.pi/canvas/` are not moved automatically.
Stop all Pi sessions that use the workspace and back up the saved documents before moving them.
If `.pi/sketchbook/` does not exist, move the complete `.pi/canvas/` directory to `.pi/sketchbook/`.
If both directories exist, keep both and resolve document ID conflicts before moving files; do not overwrite either directory.
Document IDs, revisions, and schema version 1 remain unchanged.
Start Pi again to load the renamed tools and skill, then open documents for new viewer URLs.

## Use

Use `/skill:sketchbook` in Pi. The older commands `/skill:sketchbook-create-diagrams`, `/skill:sketchbook-diagram-design`, and `/skill:sketchbook-explain-diagrams` are not aliases. Update saved prompts to use the new command.

Load the bundled skill explicitly:

```text
/skill:sketchbook Explain this system with an overview, API detail, and storage detail.
```

For a quick overview, answer in chat first: state what the subject does and list its main features. Save a page only when requested or when a visual helps.
When the skill handles a diagram request, it saves the page, opens the local Viewer, and returns its link by default.
The skill uses the bundled Diagram Design guide to choose the right diagram type and saves the complete HTML. No renderer choice is needed.
Simple questions that do not benefit from diagrams should not trigger the skill automatically.
Automatic skill selection remains unverified.
See the [HTTP cache example](examples/diagram-design/http-cache.html) for a gradual explanation from a fresh copy to cache validation and the complete decision flow.

| Tool                   | Input and result                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `sketchbook_write`     | `{document}` creates a document and returns its ID, revision, storage path, summary, and rendering-unverified status.                           |
| `sketchbook_read`      | `{documentId}` returns `{documentId, revision, updatedAt, document}` in `structuredContent.stored`.                                             |
| `sketchbook_write`     | `{document, documentId, expectedRevision}` replaces the full original document if the revision matches.                                         |
| `sketchbook_open`      | `{documentId}` returns an ephemeral local Viewer URL; it does not launch a browser.                                                             |
| `sketchbook_read_book` | `{documentId}` returns `{ok: true, book: StoredBook \| null, contentTruncated}`. `null` means no sidecar; its initial revision is `0`.          |
| `sketchbook_edit`      | `{documentId, expectedRevision, operation}` returns `{ok: true, documentId, revision, record: 'document' \| 'book', renderingVerified: false}`. |

For edits, read the record you intend to change and use its revision. On conflict or an uncertain result, read that same record again before deciding whether to retry.
A successful write confirms validation and storage. Neither writing nor calling `sketchbook_open` verifies browser rendering.
Pi and MCP use the same validation and store the exact HTML or SVG source.
The [document format](skills/sketchbook/references/document-format.md) defines fields, IDs, limits, heading roles, and tool details.

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

See [edit operations and targeting](skills/sketchbook/references/document-format.md#edit-operations) for exact fields and [progressive acceptance](docs/acceptance.md#progressive-sketchbook-handoff) for the verification handoff.

### LAN access

Call `sketchbook_open` and use its complete returned URL on a device on the same trusted LAN.
No manual IP entry, host flag, or network configuration is required in Sketchbook.
After changing this checkout, run `npm run build`, use `/reload` in Pi, and reopen the document.

- The read-only viewer listens on `0.0.0.0` on a random port.
  - This opens every IPv4 interface, not just the LAN; Host checks are not client-IP filtering.
  - The returned URL uses the first detected non-internal private IPv4 address in operating-system interface order.
  - Private addresses are in `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`.
  - If none is detected, the URL uses `127.0.0.1`; the listener still uses `0.0.0.0`.
  - `0.0.0.0` is a bind address, not the address another device opens. IPv6 is not supported.
- Requests must use a detected private address or `127.0.0.1` with the exact viewer port.
  - If an Origin header is present, it must match that request's allowed Host.
  - Wildcard, public-address, hostname, and unassigned-address Host values are rejected.
  - Host validation, same-origin access, and Content Security Policy (CSP) limit browser access.
- HTTP is unencrypted.
  - Use only trusted networks and operating-system firewall policy; do not expose or forward the port to the Internet.
  - Keep secrets out of documents.
- Keep the full viewer URL private. Data requests require the per-server capability token in its fragment. The token permits document reads within that viewer's workspace, not only the linked document.
- VPNs or virtual interfaces can affect which private address is detected first.
  - Automatic selection does not prove that a second device can reach that address.
  - Firewall policy or Wi-Fi client isolation can also block access; Sketchbook does not change either.
  - See the [LAN device handoff](docs/acceptance.md#lan-device-handoff) for the remaining checks.

Addresses are captured when the listener starts.
If the network or DHCP address changes, reload Pi and open a fresh URL.

### Article review

Check the complete heading outline before reviewing individual diagrams. Define terms before using them. Give each diagram one question. Verify arrows, decision outcomes, and order against the source. Keep recurring names consistent. Review every chapter and section at desktop and 390px. Check label size, text wrapping, and local scrolling at the authored scale. Report saving, rendering, readability, source correctness, and human acceptance separately.

## Add Diagram Design HTML

Place the complete self-contained Diagram Design output in a block with `type: "diagram-html"`, an `id`, a `title`, and the full `html` string. Add these blocks to the first page, sections, or chapters to assemble the book. The Viewer keeps the drawings, typography, and captions together without a diagram frame or camera. See the [HTML policy](skills/sketchbook/references/document-format.md#diagram-design-html).

Python is not required to import or view HTML. The Viewer works offline. MCP-only clients can read and write the same format; provide your own authoring workflow if the client does not load skills.

## Open older books

Schema version 1 still supports Markdown, code, Diagram Design HTML, and static SVG slides. An old `defaultDiagramSource` field is accepted but ignored. Do not add it to new documents.

This version cannot render Mermaid slides. The book does not skip those slides: opening fails if they appear in the original page or a chapter or section. A supported original page can still be read on its own when only its sidecar contains Mermaid. Sketchbook does not convert or rewrite the unsupported records.

Back up the entire `.pi/sketchbook/` directory, including both `.json` and `.book.json` files. The last full-format reader verified for these books is revision `10bc8574615c77f5e2d229850a4340c29cb2bae7`. In a separate recovery checkout of that revision, use Node.js 26 and run:

```sh
npm ci
npm run build
npm pack
```

Install the resulting local tarball or point your MCP client at the recovery checkout’s `dist/mcp-cli.js`. Open a backup copy first. This reader also supports Diagram Design HTML and static SVG. If you redraw a Mermaid book, save the new book separately.

## Rendering and security

- Imported Diagram Design HTML displays in a borderless, sandboxed page. Scripts, navigation, and external resources are not supported; external stylesheets such as web fonts are removed. Internal styles and local SVG definitions stay inside the authored page.
- Static SVG slides display as isolated, plain images without a diagram toolbar. On narrow screens, scroll wide drawings horizontally within the page or slide.
- Markdown supports inline/display LaTeX, fenced code, and footnotes, but not raw HTML or images.
  - Footnote targets are local to each Markdown block or slide explanation.
  - In-page links move focus without replacing the viewer token, so the current URL remains valid after navigation.
  - KaTeX uses `trust: false`, `maxExpand: 1000`, and `maxSize: 20`.
- The Viewer uses Diagram Design's default light palette and editorial typography for every document. Diagram Design pages can opt into the book's reading-column alignment with `<body class="sketchbook-default-layout">`. Other imported pages keep their own margins, width, and colors.
- Font files, licenses, scripts, styles, and renderers ship with the Viewer. The Viewer provides Instrument Serif, Geist, Geist Mono, and Traditional Chinese Noto families without a CDN. For glyphs outside those fonts, the browser uses system fallbacks.
- See [LAN access](#lan-access) for viewer network controls and URL privacy.
- A render error for supported content does not remove the rest of the document.
  - Rendering runs on the browser main thread; error handling is not CPU isolation.

## Files and lifecycle

The workspace stores the original page at `.pi/sketchbook/<documentId>.json` and, if present, its sections and additional chapters at `.pi/sketchbook/<documentId>.book.json`. Supported records need no migration. A full replacement changes only the original page; it leaves the sidecar intact.
Only `.pi/sketchbook/.gitignore` is created for local artifact exclusions; the root `.gitignore` is not changed.
Writes use revision checks, a same-process mutation queue per record, and atomic rename. There is no cross-process lock or transaction spanning both records. Do not write the same document from multiple Pi or MCP processes.

Only `sketchbook_open` starts the viewer server.
Pi TUI and RPC sessions can open it; Pi print and JSON modes can read and write records but cannot open the Viewer.
Stopping the Pi session or MCP server closes the viewer and invalidates its URLs without removing documents.
After reload, new, resume, or fork, open again for a current URL.
Tree navigation and session branching do not restore disk documents; read and create a new ID for a separate document branch.
Physical second-device LAN access, remote SSH, container forwarding, and WSLg/Windows browser access need environment-specific verification.

## Verify

Source builds, including Git installation, require `tar` and network access to download and verify the pinned Diagram Design source archive. The build packages the skill, templates, exporter, and license notices. The prebuilt npm package does not download the upstream archive.

```sh
npm run ci
npx playwright install chromium
npm run test:browser -- --output=test-results/browser
npm pack --dry-run
npm run test:package
```

The package smoke test checks the Git install and update against a disposable repository, as well as the prebuilt npm tarball and local checkout. It does not change your Pi settings.

Run `prek run --all-files` with [prek](https://prek.j178.dev/) to run `biome check` and audit GitHub Actions and Dependabot configuration with `zizmor --pedantic --fix .github`. Biome does not write changes. Zizmor applies only safe fixes; review and stage them before retrying a commit.

Husky remains the default Git hook runner. Its pre-commit script checks a temporary copy of staged content. Biome uses the staged configuration and ignore rules; the comment check uses [the staged baseline](scripts/comment-baseline.json).
The comment check covers tracked JavaScript, TypeScript, CSS, HTML, YAML, JSONC (including TypeScript configurations), shell scripts, and Husky hooks. Markdown and comment-like text inside strings and fixture data are not source comments.

- Keep required notices, tool directives, and JSDoc for exported declarations in `src/`.
- Do not add, edit, duplicate, or move other comments to a different file. Record design rationale in [decision records](docs/decisions/) and workarounds in issues or [issue drafts](docs/follow-ups.md).
- When removing a retained comment, delete its exact entry from the baseline in the same commit. Remove the path key if its list becomes empty. The baseline cannot grow or accept replacement entries.

The script does not change the working tree or index. Correct reported issues and stage only the intended changes before retrying.

On a fresh Linux system, use `npx playwright install --with-deps chromium` if browser system libraries are missing.
The explicit browser output directory preserves separate review captures under `test-results/`.

See [compatibility evidence](docs/compatibility.md) for measured results and [acceptance](docs/acceptance.md) for human checks, future authorized model tests, and release-owner actions.
Automated checks do not establish visual acceptance or reliable automatic skill loading.

## Scope and license

Sketchbook does not provide cloud sharing, accounts, live collaboration, browser editing, nested chapters or sections, version history, restore, autoplay, export, or HTTP MCP transport.
See [LICENSE](LICENSE) for the GNU Affero General Public License, version 3.
