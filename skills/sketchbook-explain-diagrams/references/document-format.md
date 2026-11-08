# Document format and tools

## Complete document

Submit this shape as the `document` argument to `sketchbook_write`.
Do not add envelope fields to the document.

```typescript
type SketchbookDocument = {
  schemaVersion: 1
  title: string
  blocks: Array<
    | { id: string; type: "markdown"; markdown: string }
    | {
        id: string
        type: "diagram-deck"
        title: string
        slides: Array<{
          id: string
          title: string
          mermaid: string
          explanationMarkdown: string
        }>
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
  - Limit each Mermaid source to 32 KiB of UTF-8 text.
- Use only the fields shown above and schema version 1.

Markdown supports prose, inline math such as `$r + 1$`, display math between `$$` lines, and fenced code.
Use a diagram deck even for one diagram; a Mermaid Markdown fence is not a second diagram format.

## Article headings and emphasis

- `document.title` owns the page H1; do not repeat it as a Markdown H1 or an opening subject heading.
- Start article Markdown headings at H2 and use lower levels for subsections.
- `deck.title` becomes a stable H2 chapter heading.
  - The active slide title becomes H3 and changes with slide navigation.
  - Use no headings in short slide explanations; if needed, start at H4 so they cannot compete with chapter or slide headings.
- Put CJK punctuation outside Markdown emphasis delimiters when adjacent text can prevent parsing.
  - Use `**資料範圍**：依` rather than `**資料範圍：**依` and check that no literal emphasis delimiters appear in the viewer.

## Content policy

- Begin each diagram with `flowchart` and a direction such as `LR` or `TD`.
  - Use subgraphs to group architecture components.
  - Submit plain Mermaid source, without Markdown fences.
- Do not use other diagram types, Mermaid frontmatter, configuration directives, node metadata (`@{...}`), click actions, HTML, images, or icons.
- Do not use raw HTML or images in Markdown.
  - Use ordinary links with safe schemes such as HTTPS.
- Do not use LaTeX commands that require trusted HTML or external resources.

The application controls the hand-drawn look, fixed seed, strict security settings, and SVG sanitization.
Do not try to override these settings.

## Tool contract

### Create

`sketchbook_write({ document })` creates a generated ID at revision 1.
Omit both `documentId` and `expectedRevision` for creation.
The result includes `documentId`, `revision`, `path`, a `blocks` summary, and `renderingVerified: false`.
A successful write means validation and persistence succeeded, not that Mermaid or LaTeX rendered.

Keep these evidence states separate in the handoff:

- **Saved**: the write returned an ID and revision.
- **Rendered**: browser evidence shows that the inspected Markdown, Mermaid, and math rendered without errors.
- **Readable**: complete visual review supports the article's composition and reading order at desktop and 390px, including every slide's initial fitted labels and explanation.
- **Content-correct**: source checks and article review support arrow recipients, actions, order, decision inputs and outcomes, slide contributions, concept order, and caveats.
- **Human acceptance**: a person explicitly accepted the result; agent checks do not establish this state.

Name the checked revision, viewport widths, and slide coverage, and mark missing evidence as unverified.
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

### Open

`sketchbook_open({ documentId })` returns an ephemeral viewer URL in TUI or RPC mode.
It listens on `0.0.0.0` and automatically returns the first detected non-internal private IPv4 address in operating-system interface order, or `127.0.0.1` if none is detected.
No host flag or manual IP entry is required.
The wildcard listener opens every IPv4 interface, even when the URL falls back to loopback; use only trusted networks and firewall policy.
Accepted Host values are detected private IPv4 addresses in `10/8`, `172.16/12`, or `192.168/16`, plus `127.0.0.1`, on the actual viewer port.
An Origin header must match that request's allowed Host; public, wildcard, hostname, unassigned, and mismatched-origin requests are rejected.
A tool argument does not select the host.
Use the returned URL and keep its capability token private.
VPN or virtual interfaces can affect automatic selection; network changes require a reload and a fresh URL.
LAN HTTP is unencrypted, and the token permits document reads within that viewer's workspace, not only the linked document.
Opening does not launch an operating-system browser.
Print and JSON modes can write and read, but cannot keep the viewer server alive.
If opening is unavailable, return the saved ID and revision and explain this limitation.

## Storage and lifecycle

Files are workspace artifacts at `.pi/sketchbook/<documentId>.json`.
The package creates only a local ignore file at `.pi/sketchbook/.gitignore`, not a workspace-root ignore rule.
Do not write the same document from multiple Pi processes.
Tree navigation, resume, and fork do not undo disk writes; create a new ID for a separate document branch.
Shutdown closes the viewer server, but preserves saved documents.
After reload, new, resume, or fork, open again for a current URL.
Physical second-device LAN access, remote host forwarding, and a user's browser access require separate verification.
