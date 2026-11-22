# Document format and tools

## Complete document

Submit this shape as the `document` argument to `sketchbook_write`.
Do not add envelope fields to the document.

```typescript
type SketchbookDocument = {
  schemaVersion: 1
  title: string
  defaultDiagramSource?: "mermaid" | "diagram-design"
  blocks: Array<
    | { id: string; type: "markdown"; markdown: string }
    | { id: string; type: "code"; code: string; language?: string }
    | { id: string; type: "diagram-html"; title: string; html: string }
    | {
        id: string
        type: "diagram-deck"
        title: string
        slides: Array<
          {
            id: string
            title: string
            explanationMarkdown: string
          } & ({ mermaid: string; focusNodes?: string[] } | { svg: string })
        >
      }
  >
}
```

- Use nonempty titles, IDs, Markdown blocks, and slide explanations.
  - Keep each title within 512 characters.
- Match every ID to `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/`.
  - Keep block IDs unique within the document.
  - Keep slide IDs unique within their deck.
  - IDs are identifiers, not file paths.
- Use at most 1 MiB of UTF-8 JSON and 1 to 100 blocks per document.
  - Give each deck 1 to 20 slides.
  - Limit each Mermaid source to 32 KiB of UTF-8 text and each SVG or HTML source to 128 KiB of UTF-8 text.
  - Require exactly one source field per slide. Use `svg` for static drawing markup, not file paths or HTML.
- Treat `defaultDiagramSource` as an authoring preference. Omit it for default Mermaid behavior; selecting a different preference does not rewrite existing slides.
- Use only the fields shown above and schema version 1.

Markdown supports prose, inline math such as `$r + 1$`, display math between `$$` lines, and fenced code.
Use a `code` block for a standalone snippet. Its `code` field must contain at least one non-whitespace character.
Pass the source directly, without adding Markdown fences. The viewer displays it as text, preserving whitespace.
If provided, the `language` label must contain a non-whitespace character and be at most 64 characters long.
Use a `diagram-deck` even for one Mermaid diagram, or `diagram-html` for complete Diagram Design output. Slides can use different supported families in the same deck; neither a Mermaid Markdown fence nor a `code` block renders a diagram.

## Book content

Create the original page as a schema-v1 document. Add sections when you need named positions in a page. Add a chapter when a topic needs a separate scrollable page. Neither a cover nor a contents field is needed. Deck slides remain local to their deck and do not become chapters or sections.

```typescript
type Block = SketchbookDocument["blocks"][number]
type Slide = Extract<Block, { type: "diagram-deck" }>["slides"][number]
type Section = { id: string; title: string; blocks: Block[] }
type Chapter = { id: string; title: string; blocks: Block[]; sections: Section[] }
type StoredBook = {
  documentId: string
  revision: number
  updatedAt: string
  sections: Section[]
  chapters: Chapter[]
}
```

- The first chapter takes its title and introductory blocks from the original document. `book.sections` lists that chapter's sections, which follow its introductory blocks. `book.chapters` lists only the additional chapters, in reading order.
- Keep titles, IDs, blocks, and slides within the document format rules. A chapter or section block list can be empty and may contain at most 100 blocks. Each deck still needs 1–20 slides.
  - Use at most 32 additional chapters, 32 sections per chapter, and 4 MiB of UTF-8 JSON for the sidecar.
  - Keep chapter IDs unique within the book (do not use the original document ID), section IDs unique within each chapter, block IDs unique within each block list, and slide IDs unique within each deck. Use stable IDs for links and edits.

## Slide focus

- Leave `focusNodes` absent on the first slide of every deck and on all non-flowchart slides. Only `flowchart` and `graph` can use it on detail slides. Neither participant IDs nor other Mermaid identifiers can select a flowchart focus region.
- On a focused detail slide, supply 1–12 unique Mermaid node IDs in `focusNodes`. Each ID must match the same ASCII ID pattern above.
  - Use actual node IDs, not display labels, subgraph IDs, or edge IDs. For `Api["Document API"]`, use `"Api"`.
  - Copy the complete first slide's Mermaid string exactly, including whitespace. Do not crop or restyle the source to focus it.
- The viewer shows one hatched attention frame and starts zoomed in on its region. The frame replaces any previous frame.
  - **Fit to screen** shows the complete diagram with the current frame. **Reset to slide focus** returns to the detail view.
  - If any focus ID cannot be resolved, the viewer shows the full diagram without a frame and reports the missing focus. Correct the IDs rather than relying on the fallback.
- Focus is optional. A deck can leave it out entirely; unfocused slides can use different Mermaid source and different supported families.

## Article headings and emphasis

- `document.title` owns the page H1 on the first page. On an additional chapter page, use its `chapter.title` as the page title. Do not repeat the page title as a Markdown H1 or opening subject heading.
- Start article Markdown headings at H2 in the chapter introduction. Use lower levels for subsections. In a named section, let the Viewer show its H2 title and start Markdown headings at H3.
- Outside named sections, `deck.title` becomes a stable H2 heading.
  - The active slide title becomes H3 and changes with slide navigation. Inside named sections, deck and slide titles use H3 and H4.
  - Use no headings in short slide explanations; if needed, start at H4 so they cannot compete with the deck or slide headings. Inside a named section, start at H5.
- Put CJK punctuation outside Markdown emphasis delimiters when adjacent text can prevent parsing.
  - Use `**資料範圍**：依` rather than `**資料範圍：**依` and check that no literal emphasis delimiters appear in the viewer.

## Content policy

Begin the plain Mermaid source with a header from this table for Mermaid 12.3.0. For a flowchart, give a direction such as `LR` or `TD` and use subgraphs for real component groups or service boundaries, not to draw attention frames.

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

Use only these headers. Beta-only families, Mindmap, Event Modeling, ZenUML, and other diagram formats are not supported. Do not use `flowchart-elk`, `xychart-beta`, `classDiagram-v2`, or bare `requirement` even if Mermaid recognizes them.

- Use plain text for diagram labels. Do not use Mermaid frontmatter, configuration directives, node metadata (`@{...}`), click actions or other interactive links, HTML, images, icons, external resources, or custom plugins.
- Do not use raw HTML or images in Markdown.
  - Use ordinary links with safe schemes such as HTTPS.
- Do not use LaTeX commands that require trusted HTML or external resources.

Flowcharts use the hand-drawn look and a fixed seed. Other families use Mermaid's normal style. The application controls all rendering settings, runs Mermaid in strict mode without HTML labels or event bindings, and sanitizes generated SVG. Do not try to override these settings.

### Diagram Design HTML

- Put the complete HTML document with its `<!doctype html>`, embedded styles, and at least one inline SVG in `html`. Use `title` to label the page for assistive technology.
- Place these blocks in the original page, a section, or a chapter using the existing book tools. The main book controls organize and navigate the content; the imported HTML does not use the Mermaid diagram frame or toolbar.
- Use static HTML and CSS only. Scripts, embedded pages, forms, links, refresh metadata, external assets and animations are not supported. The Viewer removes stylesheet links and uses fallback fonts; use embedded CSS. Give wide diagrams a local scrolling wrapper.

### Static SVG policy

- Supply a well-formed SVG with an SVG namespace and a finite positive `viewBox`. Each component must have magnitude at most 32768 SVG units.
- Use static shapes, text, and local definitions such as markers, patterns, or gradients. Keep style rules self-contained. `url(...)` may reference only a local fragment (`#name`); `@media` is the only supported CSS at-rule.
- Do not use HTML, scripts, processing instructions, DOCTYPE, event attributes, animation or transition effects, links, `href`, external assets, or embedded images. Not all SVG elements, attributes, or CSS functions are accepted.
- Use system fonts for standalone SVG. The Viewer shows it as an isolated, unframed image with its slide title and adjacent explanation.

## Tool contract

### Create

`sketchbook_write({ document })` creates a generated ID at revision 1.
Omit both `documentId` and `expectedRevision` for creation.
The result includes `documentId`, `revision`, `path`, a `blocks` summary, and `renderingVerified: false`.
A successful write means validation and persistence succeeded. Pi and MCP check headers and source policy without parsing the full Mermaid body. They store the exact source; the Viewer handles diagram parsing and reports any errors on the affected slide. Saving or opening does not verify that Mermaid or LaTeX rendered.

Keep these evidence states separate in the handoff:

- **Saved**: the write returned an ID and revision.
- **Rendered**: browser evidence shows that the inspected Markdown, Mermaid, and math rendered without errors.
- **Readable**: complete visual review supports the article's composition and reading order at desktop and 390px, including every slide's initial fitted labels and explanation.
- **Content-correct**: source checks and article review support arrow recipients, actions, order, decision inputs and outcomes, slide contributions, concept order, and caveats.
- **Human acceptance**: a person explicitly accepted the result; agent checks do not establish this state.

Name the checked document ID, record revisions, viewport widths, chapters, sections, and slide coverage, and mark missing evidence as unverified.
Include the compact review record defined in the diagram patterns with the available evidence.
Do not infer one state from another; saving, rendering, and minimum label sizes do not establish readability or content correctness.

### Read and replace

`sketchbook_read({ documentId })` returns this envelope in `structuredContent.stored` and `details.stored`:

```typescript
{
  documentId: string
  revision: number
  updatedAt: string
  document: SketchbookDocument
}
```

Read text is limited to 48,000 bytes or 1,900 lines; the complete envelope remains in the structured result and at the reported file path.

`sketchbook_write({ document, documentId, expectedRevision })` replaces the complete document.
Use the revision from the latest read as `expectedRevision`.
A conflict leaves the current document unchanged and requires another read before retrying.
After an interrupted response, read to check whether the write already committed.
A full replacement changes only the original document. It does not remove or replace its sections or additional chapters.

### Read book

`sketchbook_read_book({ documentId })` returns `{ ok: true, book: StoredBook | null, contentTruncated: boolean }`. `null` means there is no sidecar; use revision `0` for its first edit. It does not include the original page title or introductory blocks; get those with `sketchbook_read`.
In Pi, use the complete `structuredContent.book` or `details.book` if the 48,000-byte or 1,900-line text preview is truncated. MCP returns full book data in both text and structured content and sets `contentTruncated: false`.

### Edit operations

`sketchbook_edit({ documentId, expectedRevision, operation })` applies one revision-checked edit. Success returns `{ ok: true, documentId, revision, record: 'document' | 'book', renderingVerified: false }`. `record` tells you which revision changed.

```typescript
type Operation =
  | { type: "add-chapter"; chapter: Chapter }
  | { type: "add-section"; chapterId?: string; section: Section }
  | { type: "rename-chapter"; chapterId: string; title: string }
  | { type: "reorder-chapters"; chapterIds: string[] }
  | { type: "rename-section"; chapterId?: string; sectionId: string; title: string }
  | { type: "append-block" | "replace-block"; chapterId?: string; sectionId?: string; block: Block }
  | { type: "append-slide"; chapterId?: string; sectionId?: string; deckId: string; slide: Slide }
```

- Omit `chapterId` to address the first chapter in operations with an optional `chapterId`. Give `sectionId` to target a section's block list. Otherwise block and slide operations target the chapter's introductory block list.
- For `append-block`, `replace-block`, or `append-slide` with neither `chapterId` nor `sectionId`, use the original document revision from `sketchbook_read`. For all other operations, use the sidecar revision from `sketchbook_read_book`, or `0` if `book` is `null`.
- `replace-block` selects an existing block by `block.id` in the target list. `append-slide` selects a diagram deck by `deckId` in that list. Appends must use new IDs in their scope; they do not replace content.
- `rename-chapter` addresses an additional chapter. Use a full document replacement to change the first chapter's title. `reorder-chapters` takes every additional chapter ID exactly once, in the desired order; the original stays first. Renaming preserves IDs.
- Before saving, Sketchbook validates the complete resulting record. A rejected or failed commit leaves that record and revision unchanged. If the result is uncertain or conflicts with a newer edit, read the destination, compare its revision and the target content, and apply only the change still needed. The two revisions do not guarantee a transaction or a joint snapshot.

### Open

`sketchbook_open({ documentId })` returns an ephemeral viewer URL while the viewer server is running.
In Pi, opening requires a persistent TUI or RPC session. In a client using the MCP tools, the connection to the MCP server must stay open.
It listens on `0.0.0.0` and automatically returns the first detected non-internal private IPv4 address in operating-system interface order, or `127.0.0.1` if none is detected.
No host flag or manual IP entry is required.
The wildcard listener opens every IPv4 interface, even when the URL falls back to loopback; use only trusted networks and firewall policy.
Accepted Host values are detected private IPv4 addresses in `10/8`, `172.16/12`, or `192.168/16`, plus `127.0.0.1`, on the actual viewer port.
An Origin header must match that request's allowed Host; public, wildcard, hostname, unassigned, and mismatched-origin requests are rejected.
A tool argument does not select the host.
Use the returned URL and keep its capability token private.
The default link opens the original page. Add `chapter=<chapterId>` to the query for an additional chapter, and `section=<sectionId>` for a named position. For a first-page section, omit `chapter`. Keep the original `documentId` query field and `#token=…` fragment; never move the token into the query. Chapter and section links require the same read-only access and expire with the same session.
VPN or virtual interfaces can affect automatic selection; network changes require a reload and a fresh URL.
LAN HTTP is unencrypted, and the token permits document reads within that viewer's workspace, not only the linked document.
Opening does not launch an operating-system browser.
Print and JSON modes can write and read, but cannot keep the viewer server alive.
If opening is unavailable, return the saved ID and revision and explain this limitation.

## Storage and lifecycle

The original document lives at `.pi/sketchbook/<documentId>.json`. The optional sidecar lives at `.pi/sketchbook/<documentId>.book.json`. Use the tools, not direct edits to these files.
The package creates only a local ignore file at `.pi/sketchbook/.gitignore`, not a workspace-root ignore rule.
Writes are queued by destination within one process and use atomic rename. All sidecar sections and chapters share a revision, so edits to different sections can still conflict. There is no cross-process lock: do not write the same document from multiple Pi or MCP processes.
Tree navigation, resume, and fork do not undo disk writes; create a new ID for a separate document branch.
Shutdown closes the viewer server, but preserves saved files.
After reload, new, resume, or fork, open again for a current URL.
Physical second-device LAN access, remote host forwarding, and a user's browser access require separate verification.

The original page stays schema version 1. A compatible older build can still open it but does not show sidecar content. Back up and keep both records before downgrading; reopen with a book-aware build to see the extra content. An older reader that accepts only `flowchart` cannot open a page containing a newer header. Keep the original source intact.
