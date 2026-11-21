# Keep the original page as the first chapter

## Context

The [progressive Sketchbook PRD](../prd/progressive-sketchbook.md) requires promotion without changing the original link, plus targeted edits from Pi and MCP. A replacement record with nested chapters could make every edit atomic in one file, but would change the meaning of the existing document ID and prevent older tools from reading or editing that file. A manifest referencing separately saved chapter documents preserves the file format, but publishing a chapter would span two files and section boundaries inferred from block IDs could break on legacy replacements.

## Decision

- Keep `<documentId>.json` as the original schema-v1 page. Store first-page sections and any additional chapters in an optional `<documentId>.book.json` sidecar, keyed by the original page ID. Inline the additional chapters so adding one and publishing its position use one atomic rename. Do not infer sections from existing blocks.
- The original page supplies the first chapter's introductory blocks and title. Its sections follow those blocks. Adding a section alone does not make a book; adding a second chapter does. The first chapter stays first; additional chapters may be renamed and reordered without changing their IDs. A legacy replacement changes only the original page, not its sections or other chapters.
- Keep `sketchbook_write`, `sketchbook_read`, and `sketchbook_open` compatible. Expose a dedicated read operation for sidecar content and a shared edit operation for explicit mutations. An edit checks the revision of the record it writes: the original document for its introductory blocks or slides, or the book sidecar for structured content. Revision zero means no sidecar. Serialize each read, check, and write by its canonical destination; concurrent changes to the same record conflict. The existing cross-process restriction still applies.
- Validate the complete resulting record before writing. Preserve the current document limits; cap sidecars at 4 MiB, 32 additional chapters and 32 sections per chapter. Keep block and slide limits for each content list. Use stable caller-assigned IDs for added content and reject duplicate IDs within their scope. On conflict or an uncertain result, read the destination first. A failed commit does not change the prior record or consume a revision.
- Authorize the sidecar with the same session token as the page. Add sidecar data only to the Viewer response when present. The page link still opens the original chapter; optional chapter and section query fields select stable IDs. Keep the token in the fragment, never in a query parameter or retained evidence. Chapter and section navigation does not confer write access.

## Consequences and verification

- An older build still opens and edits the original page. It does not show sidecar content; keep both records and reopen with a compatible build. No migration or destructive downgrade is required.
- The chapter list and sections share one sidecar revision, so edits to different sections can conflict conservatively. This avoids merge rules and does not require the caller to send unrelated content. The two records do not promise a transaction or snapshot spanning both revision domains.
- Test old links across promotion, legacy replacements with sections present, stale and invalid edits, interrupted writes, and unchanged sibling content. Test authorization and deep links at desktop and mobile widths through the real Viewer.
