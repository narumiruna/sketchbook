# Acceptance and external handoff

## Current boundary

The bundled examples and static skill checks do not prove that a model will select the skill or use the tools correctly.
Paid model evaluations, npm publication, version tags, and release-workflow dispatch require separate authorization.
Human visual acceptance and remote forwarding remain unverified.

## Progressive Sketchbook handoff

Follow the [progressive Sketchbook PRD](https://github.com/narumiruna/sketchbook/blob/main/docs/prd/progressive-sketchbook.md) (R1–R6) and [original-page storage decision](https://github.com/narumiruna/sketchbook/blob/main/docs/decisions/0004-keep-original-page-as-first-chapter.md). Use a disposable workspace and the `tests/fixtures/progressive-book.ts` inputs from this checkout. The chat app is a teaching example, not a claim about a deployed service.

Evidence for the documentation and fixture:

- **Schema and policy:** The two schema-v1 pages and a sidecar with the first-page section and four additional chapters (including the optional append case) passed local validation. All five Mermaid sources passed the sequence, flowchart, or entity relationship family and source-policy checks. `npm test -- tests/skill.test.ts` passed 61 static skill tests.
- **Rendering and navigation:** `tests/browser/book.spec.ts` exercises the real Viewer with the standalone overview and all four chapters, including all five slides at 390px and 1440px. It checks live promotion, previous/next, keyboard focus, history, deep links, and read-only access. Its full-page captures and metrics contain no Viewer URLs.
- **Readability and acceptance:** Agent review checked both widths, including the chapter and section contents, heading order, diagrams, explanations, and code. The two sequence diagrams measured about 11.8 CSS px at their smallest fitted text at 390px, just below the 12px teaching target. The narrow SQL example scrolls within its code block. Human readability and product acceptance remain unverified. Record integration results against the exact checkout tested.

### Tool and Viewer checks

- [ ] **R1 — Start small.** Use `codebaseOverview` as the one-page save case. Open it directly with no book navigation or required structure. In a separately authorized model trial, first ask “What does this codebase do?” and confirm the answer gives its purpose and main features in chat without a tool call. Ask for one feature's implementation and confirm the follow-up cites verified source locations without displacing the overview.
- [ ] **R2 — Grow the original page.** Save `chatOverview` and retain its open link privately. Read the absent sidecar (`book: null`), then add `chatFirstSection` with expected revision `0`. Check that the section follows the original blocks and there is no Book contents list yet. Add `chatChapters` in fixture order. In the same running Viewer session, the original link still opens **How a message travels** with its original text and sequence diagram.
- [ ] **R3/R4 — Navigate the book.** Confirm the four entries are **How a message travels**, **System architecture**, **API design**, and **Database design**, in order. From Book contents, open chapter three; use Previous chapter and Next chapter, and use the section links nested under the active API chapter to jump within it. In Retry, change slides without changing the section or chapter. Open its link in a fresh tab; it has `chapter=api` and `section=retry` in the query and the original access token only in the fragment. Rename and reorder the API chapter, and check the same link opens Retry. Repeat with keyboard input at 390px and 1440px; check focus and the full scrollable chapter, including code, diagrams, and every slide.
- [ ] **R5 — Edit without replacing siblings.** In Pi and MCP, append a new diagram-deck block to Retry, append a slide to a specific deck, and add `chatExtraChapter`. Compare before/after reads: existing sections, blocks, slides, and other chapters stay unchanged except at the selected target. Test explicit block replacement, an original-page edit guarded by `sketchbook_read`, and sidecar edits guarded by `sketchbook_read_book`. Submit a stale edit and an invalid target and check that the destination remains unchanged. After an interrupted response, read that destination to determine whether it committed; do not infer one record's state from the other.
- [ ] **R6 — Preserve compatibility and access.** Read and open the schema-v1 document with the existing tools. Replace the full original page and verify that the sidecar is unchanged. Check that a deep link cannot load protected content without valid Viewer access, that the Viewer has no write route, and that shutdown invalidates all links in that session while preserving both records.

### Package and evidence handoff

1. Build and test a clean checkout with `npm run ci`, `npm run test:browser`, `npm pack --dry-run`, and `npm run test:package` (install Playwright Chromium first if needed). Use the package smoke test for built local and extracted npm-tarball Pi loading and standalone MCP installation. Verify the five-tool catalog and the read/edit round trip in the packaged hosts, not only in source-level tests.
2. Record the exact commit, Node/Pi/browser versions, commands and results, document ID, separate record revisions, and viewport, chapter, section, and slide coverage. Keep save and read-back, render success, readability, content correctness, and human acceptance separate. Automated navigation and rendering checks do not establish human reading comfort or comprehension. Do not retain private links, tokens, or user content.
3. Have a person review the complete walkthrough at both widths and record acceptance or issues. Automatic skill selection, real-model authoring of the quick-to-book workflow, UI behavior in third-party MCP clients, physical devices, and remote forwarding need separate evidence. Follow the authorization rules below for model or release operations.

## Future authorized model checks

The provider or account owner must authorize API usage before running these checks.
Record the model ID, Pi version, package revision, prompt, tool transcript, output ID/revision, browser evidence, and any errors.
Do not record credentials or a reusable capability token in published evidence.
First send each prompt without an explicit skill command to observe discovery.
If the model does not load the skill, record that result and repeat with `/skill:sketchbook-create-diagrams` prefixed to the same prompt.
A successful explicit invocation does not prove reliable automatic selection.

### Indirect activation and near-miss

Run each prompt in a fresh session on the target Pi client and model. Start with no skill command or tool names. Inspect the skill-load trace, not only the answer.

**Indirect prompt:**

> Explain the order of messages when a client sends a request through a gateway to an inventory service and receives the result. I need to see who sends what and what happens first.

- [ ] Record whether the skill loaded. If it did not, repeat with `/skill:sketchbook-create-diagrams` in a fresh session and record that result separately.
- [ ] After the skill loads, it uses a sequence diagram to show the message order and direction.
- [ ] The skill calls `sketchbook_write` and then `sketchbook_open` without a separate request for a saved article or Viewer link.

**Simple near-miss:**

> What does HTTP status 204 mean? Answer in one sentence.

- [ ] The skill does not load automatically.
- [ ] The answer is direct. It does not suggest a diagram, save a document, or open a Viewer.

Mechanical Pi skill discovery and explicit command expansion do not require a model call. Without the target client and model traces, automatic selection and near-miss behavior remain unverified.

### Quantitative visualization prompt

> Compare open ticket counts for January, February, and March: 4, 7, and 5. Show the comparison as a diagram.

- [ ] The skill selects an XY chart instead of a flowchart or component map.
- [ ] The three values match the three months in the prompt. The chart labels the quantity as open tickets.
- [ ] The skill saves the document and returns its Viewer link without another request.

### Architecture prompt

> Create a Pi Sketchbook walkthrough for a fictional document service used by new backend engineers.
> Start with a system overview, then explain the API, then the storage write path.
> Keep the Client, Document API, and Document Store names and node IDs consistent.
> Include prose, inline and display LaTeX for request latency, and a short fenced TypeScript example.
> Use a subgraph, one Chinese label, and short diagram labels; put detailed qualifications in Markdown.
> Review the complete article outline before the slide sequence and inspect every slide at desktop and 390px.
> Save the document and give me a local viewer link without launching a browser.
> Label assumptions and tell me whether rendering was checked.

Expected assertions:

- [ ] The transcript records whether the skill was loaded automatically, explicitly, or not at all.
- [ ] The document passes the strict version-1 schema and content policy.
- [ ] A main deck has overview → API → storage slides, each with a nonempty explanation.
- [ ] Each detail slide names its connection to the preceding context and explains a distinct part of the save path.
- [ ] Repeated components keep the same node IDs, names, and meanings.
- [ ] Prose, inline/display LaTeX, fenced TypeScript, Chinese text, short diagram labels, and a subgraph are present.
- [ ] The article has one page H1, stable H2 chapter headings, and subordinate H3 slide titles.
- [ ] Terms are defined before use and the conclusion answers each main question.
- [ ] Assumptions are marked as a teaching model instead of source-verified implementation facts.
- [ ] Creation omits `documentId` and `expectedRevision`, and the result reports the generated ID and revision.
- [ ] Opening uses a supported TUI or RPC session and automatically returns a detected private IPv4 URL, or a loopback URL fallback, without an OS-browser launch or host configuration.
- [ ] A compact review record traces arrow recipients, actions, required order, and decision outcomes to sources or explicit teaching facts.
- [ ] Each slide adds needed information across the whole article, not only within its deck.
- [ ] The final response separates saved, rendered, readable, content-correct, and human acceptance results.

### Process prompt

> Create a Pi Sketchbook guide to replacing a saved document.
> Use flowcharts to show the complete flow, then expose the revision inputs, outcomes, and no-write conflict boundary.
> Add detail views only when they add needed information; do not add start or end slides that repeat the overview.
> Show how a revision conflict returns to a read instead of overwriting a newer change.
> Include prose, inline and display LaTeX for the next revision, and a fenced TypeScript example.
> Save the guide and return its viewer link.
> Then read the saved guide and add a short conclusion through a revision-checked full replacement.
> Do not write storage JSON directly, and do not claim rendering success without a browser check.

Expected assertions:

- [ ] The document passes the strict version-1 schema and uses only flowcharts.
- [ ] The main deck establishes the replacement flow and exposes the comparison inputs and match/no-write outcomes without redundant stage slides.
- [ ] Each stage explains its inputs or outputs and keeps the handoff to the next stage visible.
- [ ] Repeated steps keep the same node IDs, labels, and meanings, and the conflict exit is visible.
- [ ] Prose, inline/display LaTeX, and fenced TypeScript are present.
- [ ] The update reads the stored envelope and supplies its revision as `expectedRevision`.
- [ ] The update submits a complete document and keeps existing stable block and slide IDs.
- [ ] A conflict triggers another read, not a blind overwrite.
  - [ ] Record this as untested if no conflict is exercised.
- [ ] No direct storage-file edits or unsupported content occur.
- [ ] The final response reports the saved revision, viewer status, and rendering evidence separately.

## Diagram family acceptance

Use the [Mermaid 12.3.0 header table](../README.md#supported-mermaid-diagrams) as the expected matrix. Run these checks against the production-built Viewer and keep results separate from the earlier discovery probe.

- [ ] Pi and MCP save and read every supported header without altering source or changing the document schema or revision rules. Both reject excluded or unknown headers, disallowed configuration, interactions, external resources, and non-flowchart `focusNodes`.
- [ ] Every accepted header renders visible fixture-specific labels or marks with nonzero geometry under the existing CSP. Do not count SVG presence alone as a pass.
  - [ ] Check the mixed deck at 390px and 1440px. Test switching families, Fit, zoom, and inert source display; verify flowchart focus and hand-drawn rendering independently.
  - [ ] Check duplicate instances, rapid switching, revision updates, and recovery after replacing a malformed body. A failed slide must not hide unrelated content.
  - [ ] Check that document content does not load resources or attach active markup, event bindings, or styles outside the affected SVG. Any SVG definition reference must resolve within its own sanitized SVG.
- [ ] Verify a non-flowchart in packed Pi and in standalone MCP. Confirm bundled skill discovery and explicit command expansion mechanically. These checks do not establish automatic skill loading.
- [ ] Retain tool versions, command results, and representative screenshot paths in [compatibility evidence](compatibility.md#delivery-verification). Report the exact clean-checkout commit in the pull request. Do not retain private Viewer links or user documents.

## Article structure and visual review

Review the complete article before checking individual deck transitions.
Check its heading outline, prerequisite concepts, first definitions, repeated text, and conclusion coverage.
The current page title owns H1, and named sections use H2. Deck and current slide titles use H2 and H3 outside named sections, or H3 and H4 within them. Markdown explanations must not introduce competing headings.

`tests/browser/mermaid-types.spec.ts` checks that the sequence walkthrough shows the two participants and both messages in order, fits the diagram, and stays within the page at 390px and 1440px.
`tests/browser/article-review.spec.ts` covers the bundled flowchart examples, the source-linked Agent Substrate regression, and the two active-agent authoring cases in `tests/fixtures/viewer-handoff.json` and `tests/fixtures/receipt-check.json`.
The article review suite captures the complete initial and final article and every slide at 1440px and 390px.
Each teaching slide must have initial fitted SVG labels of at least 12 CSS px, body explanations of at least 16px, no exposed emphasis delimiters, no page overflow, and at most 64px of unused frame height.
These are finite regression checks, not a claim that arbitrary diagrams meet the same target or that passing a size floor establishes explanation quality.
Review diagram meaning, composition, graph/prose proximity, and contribution independently of rendering results.
Reports also record heading, toolbar, pagination, and explanation boxes relative to each card.
Large-graph and long-label stress tests remain separate from the teaching examples.

The original Agent Substrate review found two H1 headings, changing H2 chapter names, default fitted labels of about 7–11px on desktop and 2–4px at 390px, exposed CJK emphasis markers, and a broken-word glossary table.
The revised fixture uses a single title, a short concept list, compact diagrams, all three egress outcomes, and a conclusion covering capacity, state, and security.
It preserves explicit suspension and the asynchronous snapshot upload failure window.
No stored document schema or tool contract changes are required.

### Reviewer handoff

The documentation reviewer can use the CI `browser-evidence-node-*` artifacts or local `test-results/browser/article-review-*/` captures after the checks pass.
Run browser checks with `--output=test-results/browser` to preserve separate before/after captures in `test-results/reading-layout/`.
Inspect complete pages and every slide, not only SVG presence or the initial position.
Assess text comfort, hierarchy, diagram meaning, and comprehension at both recorded widths.
The expected result is a readable article with stable sections and source-supported claims.
Human comprehension, subjective visual acceptance, and physical touch-device behavior remain unverified by these agent checks.
This review is not an additional prerequisite for closing the coding plan or opening the PR.
Existing release authorization restrictions remain unchanged.

## Deck continuity review

The user or documentation reviewer can perform this optional comprehension review after the updated examples pass the automated checks.
Read each main deck in order and identify its main question, the connection at each transition, and the information each slide adds.
The expected result is a connected explanation with no unrelated or redundant slides.

The bundled examples define API and Store as short labels for Document API and Document Store, and Read/Edit as process steps.
They provide these review references:

| View                  | Connection                                            | Contribution                                                                   |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Architecture overview | Establishes Client, API, and Store responsibilities.  | Separates component relationships from process order.                          |
| API detail            | Expands API's accepted/rejected handoff.              | Makes validation and the no-write outcome visible.                             |
| Revision gate         | Expands Store's serialized operation.                 | Shows revision inputs, read-after-queue ordering, and match/no-write outcomes. |
| Atomic commit         | Continues from Temp JSON.                             | Identifies Rename as the persistence boundary.                                 |
| Caller handoff        | Asks an independent question after saving.            | Separates a URL returned to Client from Browser's later request.               |
| Process overview      | Establishes complete replacement and recovery.        | Shows that a conflict returns through Read and Edit.                           |
| Serialized write      | Expands the known Write stage.                        | Exposes expected/stored inputs and Commit/no-write outcomes.                   |
| Interrupted response  | Applies the save boundary to a different uncertainty. | Requires a content-and-revision read before deciding to retry.                 |
| Sequence exchange     | Begins with the roles of Client and Service.          | Uses ordered messages to distinguish the request from the return to Client.    |

Check that names and meanings remain consistent when components reappear.
A detail slide may omit earlier internals when its explanation identifies the change of focus.
The independent one-slide decks answer separate questions and do not repeat the main sequences.
Explicit teaching facts, source claim checks, and contribution records are retained in `tests/fixtures/generation-cases.json`.
Known-failure mutations protect those cases; they are not a semantic evaluator for arbitrary articles.
Merge or remove redundant slides; move unrelated questions to separate decks.

Static fixture checks protect these specific connections and responsibilities, not the meaning of arbitrary generated decks.
Browser checks and their ignored `test-results/` captures provide rendering evidence, not comprehension acceptance.
Reader comprehension and real-model behavior remain unverified; this review is not required to complete the agent's implementation tasks.
Do not claim comprehension acceptance or reliable model output from automated checks, or release readiness from this change.
Paid model evaluations and release operations still require the authorizations stated above.

## Generation and reading-quality handoff

The active agent authored two separate cases using the revised skill, without a new paid evaluation endpoint.
These bounded trials do not establish automatic skill loading, repeatability across models, or reader comprehension.

| Case                                | Saved ID / revision                        | Source and main claims                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewer links and request boundaries | `6f5d3454-80f3-489c-be86-90182758577d` / 2 | `src/tools.ts`, `src/server.ts`, `src/web/main.tsx`, and `src/web/app.tsx` at `348c400`: read before first listen, URL returned to Caller, then a separate Browser bearer request. |
| Package receipt decision            | `925f910d-75d0-46e2-980e-51df5b63042e` / 1 | Supplied teaching facts: expected/scanned inputs, a match permits receipt, mismatch holds without a record, and correction plus rescan is required before another comparison.      |

The trial payloads and their source/scope statements remain in `tests/fixtures/`.
The repository case separates two useful questions; the process case uses one diagram because it answers the bounded question without filler.
The first Viewer trial's request diagram failed the 390px label floor at 11.01px.
The author removed repeated caller context and subgraph padding while retaining the request initiator, access check, and both outcomes, then saved revision 2 through a revision-checked replacement.
The original repository walkthrough was not rewritten.
Keep saved, rendered, readable, content-correct, and human acceptance evidence separate for these trials.

The user or documentation reviewer owns subjective visual and comprehension acceptance after agent checks pass.
Inspect the complete articles and every slide at both captured widths, then record acceptance or remaining problems with meaning, reading comfort, and control discovery.
The physical-device owner checks scrolling, direct toolbar access, and fullscreen on a real device after browser touch emulation passes.
Expected behavior is contained content and supported control-based zoom, not touch panning or pinch zoom.
Native-device behavior, user acceptance, automatic skill discovery, and broader model reliability remain unverified until their owners check them.
Do not claim release readiness from the agent evidence or perform release operations without separate authorization.

## Human browser review

Run a built package in a persistent Pi TUI or RPC session.
Use `sketchbook_write` to save each bundled asset, then `sketchbook_open` to obtain current URLs.

- [ ] Review the entire article outline and confirm one page H1, stable H2 deck titles outside named sections, and subordinate slide titles.
- [ ] Confirm all architecture, process, sequence, and Agent Substrate slides render with their explanations.
- [ ] Confirm that flowcharts keep readable default labels, arrows, Chinese text where used, and a hand-drawn style.
- [ ] Confirm that the sequence diagram uses Mermaid's normal style, shows Request above Response with arrows to the correct participants, and has no focus frame.
- [ ] Check long-label stress cases separately; they are not examples of suitable teaching layouts.
- [ ] Confirm prose, inline/display math, code, and technical names remain readable at 390px and desktop widths.
  - [ ] Scroll long fenced code to its right edge; default captures do not show every column. Confirm the complete code remains reachable on the target input device.
- [ ] Confirm Markdown emphasis renders without exposing literal delimiters.
- [ ] Change slides by visible bottom Previous/Next buttons, labelled position dots, and Left/Right keys while a deck has focus.
- [ ] Confirm the stable chapter title, current slide title, toolbar, content-sized bounded graph, and nearby explanation are comfortable to read.
- [ ] Confirm Fit, Fullscreen, zoom, Reset, source view, and input help are visible without opening a panel.
  - [ ] Confirm enabled controls are keyboard-accessible and the toolbar wraps without page overflow on narrow screens or with enlarged text.
  - [ ] Confirm a live source update moves focus from a temporarily disabled camera control to Show source without taking focus from outside the toolbar.
- [ ] Compare initial Fit with Reset zoom; confirm large graphs remain accessible through zoom and mouse/pen dragging.
- [ ] Check native browser fullscreen, in-page fallback, Escape, and focus restoration on the target browser.
- [ ] Check document scrolling and pointer behavior on any required physical touch devices; pinch zoom is not implemented.
- [ ] Confirm two decks retain independent positions and the single-slide deck has no unnecessary navigation.
- [ ] Update a document and confirm stable slide IDs retain the selected slide.
- [ ] Delete the selected slide and confirm a nearby surviving slide is selected.
- [ ] Confirm slide changes do not cause disruptive page jumps.
- [ ] Confirm local render errors leave unrelated blocks visible with readable diagnostic source.
- [ ] Close the session and confirm the viewer reports disconnection while saved files remain.
- [ ] Record acceptance or remaining issues for text size, diagram style, and explanation clarity.

Screenshots and automated render checks support this review but do not replace the user's visual acceptance.
Remote SSH, container forwarding, and WSLg/Windows browser connectivity need separate tests on the target environment.

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
Configure `npx -y @narumitw/sketchbook` as shown in the README. For local development, build this checkout and use its `dist/mcp-cli.js` entry point.
The current code defaults to the client-selected process working directory. Add `--cwd` when a fixed workspace is required.
Published version `0.2.2` is from `188aef2` and still requires `--cwd`. Use `--cwd .` with that version.
The package owner must publish a newer version to distribute the current-directory default and the early-cancellation fix.
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
