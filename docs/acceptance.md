# Acceptance and external handoff

## Current boundary

The bundled examples and static skill checks do not prove that a model will select the skill or use the tools correctly.
Paid model evaluations, npm publication, version tags, and release-workflow dispatch require separate authorization.
Human visual acceptance and remote forwarding remain unverified.

## Diagram Design handoff

From a source checkout, use the [HTTP cache test fixture](../tests/fixtures/cache-design.html) as a `diagram-html` block. The fixture does not ship in the npm package. Verify the title, drawings, and captions use the bundled local fonts and keep their authored layout. For the default theme, the chapter and diagram share the same paper color, text edge, and editorial type roles. Check a different HTML palette to confirm its own layout is not normalized. Compare screenshots at desktop and 390px and keep Viewer access URLs out of the review artifacts. At 390px, check that the diagrams scroll locally and the book does not scroll sideways. Verify the Viewer has no Mermaid toolbar or diagram frame for the imported page.

Use `npm run test:package` to verify the packaged Pi skill, offline Viewer, and three-chapter cache book via the installed MCP server. The screenshots under `test-results/package-cache-*.png` cover all three chapters at 1440px and 390px, including both sides of each wide mobile diagram. In native Claude Code and Codex CLI, check that the bundled authoring skill loads Diagram Design directly; neither host's model routing is established by the package smoke test.

## Progressive Sketchbook handoff

Follow the [progressive Sketchbook PRD](https://github.com/narumiruna/sketchbook/blob/main/docs/prd/progressive-sketchbook.md) (R1–R6) and [original-page storage decision](https://github.com/narumiruna/sketchbook/blob/main/docs/decisions/0004-keep-original-page-as-first-chapter.md). Use a disposable workspace and the `tests/fixtures/progressive-book.ts` inputs from this checkout. The chat app is a teaching example, not a claim about a deployed service.

The automated browser tests cover these sample chapters at 390px and 1440px, including diagrams, text, local scrolling, live promotion, keyboard focus, history, and private deep links. Human readability and product acceptance remain unverified.

### Tool and Viewer checks

- [ ] **R1 — Start small.** Use `codebaseOverview` as the one-page save case. Open it directly with no book navigation or required structure. In a separately authorized model trial, first ask “What does this codebase do?” and confirm the answer gives its purpose and main features in chat without a tool call. Ask for one feature's implementation and confirm the follow-up cites verified source locations without displacing the overview.
- [ ] **R2 — Grow the original page.** Save `chatOverview` and retain its open link privately. Read the absent sidecar (`book: null`), then add `chatFirstSection` with expected revision `0`. Check that the section follows the original blocks and there is no Book contents list yet. Add `chatChapters` in fixture order. In the same running Viewer session, the original link still opens **How a message travels** with its original text and diagram.
- [ ] **R3/R4 — Navigate the book.** Confirm the four entries are **How a message travels**, **System architecture**, **API design**, and **Database design**, in order. From Book contents, open chapter three; use Previous chapter and Next chapter, and use the section links nested under the active API chapter to jump within it. In Retry, change slides without changing the section or chapter. Open its link in a fresh tab; it has `chapter=api` and `section=retry` in the query and the original access token only in the fragment. Rename and reorder the API chapter, and check the same link opens Retry. Repeat with keyboard input at 390px and 1440px; check focus and the full scrollable chapter, including code, diagrams, and every slide.
- [ ] **R5 — Edit without replacing siblings.** In Pi and MCP, append a new diagram-deck block to Retry, append a slide to a specific deck, and add `chatExtraChapter`. Compare before/after reads: existing sections, blocks, slides, and other chapters stay unchanged except at the selected target. Test explicit block replacement, an original-page edit guarded by `sketchbook_read`, and sidecar edits guarded by `sketchbook_read_book`. Submit a stale edit and an invalid target and check that the destination remains unchanged. After an interrupted response, read that destination to determine whether it committed; do not infer one record's state from the other.
- [ ] **R6 — Preserve compatibility and access.** Read and open the schema-v1 document with the existing tools. Replace the full original page and verify that the sidecar is unchanged. Check that a deep link cannot load protected content without valid Viewer access, that the Viewer has no write route, and that shutdown invalidates all links in that session while preserving both records.

### Package and evidence handoff

1. Build and test a clean checkout with `npm run ci`, `npm run test:browser`, `npm pack --dry-run`, and `npm run test:package` (install Playwright Chromium first if needed). Use the package smoke test for built local and extracted npm-tarball Pi loading and standalone MCP installation. Verify the five-tool catalog and the read/edit round trip in the packaged hosts, not only in source-level tests.
2. Record the exact commit, Node/Pi/browser versions, commands and results, document ID, separate record revisions, and viewport, chapter, section, and slide coverage. Keep save and read-back, render success, readability, content correctness, and human acceptance separate. Automated navigation and rendering checks do not establish human reading comfort or comprehension. Do not retain private links, tokens, or user content.
3. Have a person review the complete walkthrough at both widths and record acceptance or issues. Automatic skill selection, real-model authoring of the quick-to-book workflow, UI behavior in third-party MCP clients, physical devices, and remote forwarding need separate evidence. Follow the authorization rules below for model or release operations.

## Future authorized model checks

The provider or account owner must authorize API usage before running these checks.
Use a fresh session for each skill-routing check:

1. Ask “What is an npm lifecycle script?” without invoking the skill. Expect a chat answer without a Sketchbook tool call.
2. Ask `/skill:sketchbook What is an npm lifecycle script?` with no existing style profile. Expect a saved page that answers the question and a private Viewer link, without a style prompt. A Markdown-only page is sufficient.
3. Explicitly request a Sketchbook diagram for a multi-step process with no existing style profile. Expect Diagram Design HTML and a Viewer link without a renderer or style prompt.
4. Ask to add a chapter to an existing Sketchbook. Expect the original page to remain first.

Record the host, model ID, exact package revision, saved record revisions, checks, and any missing evidence. Do not record credentials or Viewer links.

## LAN device handoff

The user operates the physical second device and controls any firewall or router permissions.
Build the updated extension, reload a persistent Pi TUI or RPC process, and call `sketchbook_open` for a fresh full URL.
No manual host argument is required.
Both devices must be on a trusted LAN.
The listener binds to all IPv4 interfaces, while the URL selects the first detected non-internal private IPv4 address; a loopback URL fallback does not make the listener loopback-only.
Do not send the capability URL or token to public logs or issue trackers.

Open the full URL on the second device.
The expected result is that document content, diagrams, slide navigation, and updated revisions load.
Then stop the Pi session and confirm that the second device reports disconnection and cannot fetch new document data.
Content already loaded in the browser can remain visible; stopping the server does not erase browser memory.

Physical-device routing, firewall permissions, Wi-Fi client isolation, VPN/virtual-interface selection, touch behavior, and human acceptance remain unverified by a same-host private-address check.
If connection fails, confirm the selected address and local network policy; do not disable firewall protections or expose the port to the Internet as a workaround.
Stop Pi to close the wildcard listener, or reload and open a fresh URL after a network or DHCP change.
No document migration is required.

Agent checks can establish exact binding, local browser rendering, token/origin enforcement, and listener shutdown.
They cannot establish second-device compatibility or release readiness.
Do not claim support on a specific physical device until its owner completes this check.
Existing model-cost and release-authorization restrictions remain in force.

## MCP client handoff

The user owns configuration and UI verification in Claude Desktop, Cursor, or another stdio MCP client.
Build and configure the standalone server as shown in the [README](../README.md#mcp). The source build defaults to the client-selected process working directory. Add `--cwd` when a fixed workspace is required.
The legacy npm release `0.2.2` requires `--cwd` and does not include the book tools or the early-cancellation fix.
Restart the client and confirm `sketchbook_write`, `sketchbook_read`, and `sketchbook_open` are available. On a build with book support, also confirm `sketchbook_read_book` and `sketchbook_edit`.
Create, read, replace, and open a document. With book support, read the absent sidecar, add a section at revision `0`, and read it back. The expected result is revision-checked saved content and a private Viewer URL that works while the MCP process runs.
Stop the client and confirm that the viewer can no longer fetch data; previously loaded content can remain visible.
The same trusted-network and single-writer restrictions apply to Pi and MCP.

Automated checks cover the official MCP client, real stdio subprocesses, EOF and signal cleanup, and an installed tarball without Pi.
They do not establish Claude Desktop or Cursor UI behavior, automatic authoring guidance, physical LAN access, or human visual acceptance.
Those client-specific behaviors remain unverified until the user performs this handoff.
Do not claim client UI acceptance or release readiness from protocol tests alone.

## Package-owner handoff

The package metadata names `narumiruna/sketchbook`.
The release workflow runs on pushes to `main` and manual dispatch.
Changesets creates version pull requests; after a version pull request is merged, the release script builds the package and creates version tags.
The action pushes new tags and creates GitHub Releases from `CHANGELOG.md`.
It does not publish packages to npmjs or attach build assets to GitHub Releases.

1. Confirm the repository URL in `package.json` resolves before release.
2. Confirm GitHub Actions has the required repository and pull-request permissions.
   - Review the release workflow's `PAT_TOKEN` requirement and supply an appropriate owner-managed credential or approved replacement.
   - Never provide secrets in chat, documents, example assets, or commits.
3. Review CI, isolated local/tarball installation evidence, package contents, license, and dependency audit.
4. Obtain explicit release authorization before merging a version pull request, creating or pushing a release tag, or dispatching the release workflow.

A repeated run skips existing tags. If tag creation succeeds but GitHub Release creation fails, the owner must repair the missing GitHub Release; a repeated run does not create it.
No npm credentials or trusted-publisher setup are required for this release flow.
The provider/account owner controls authorization for real-model testing.
The user controls visual and comprehension acceptance.
