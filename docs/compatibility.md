# Compatibility evidence

## Evidence labels

- **Declared** identifies the support contract or a pinned dependency, not a passed test.
- **Source** identifies an inspected implementation or dependency path.
- **Automated** identifies a completed check and its observed result.
- **Authoring trial** identifies a bounded active-agent generation and review, not automatic skill discovery or general model reliability.
- **Unverified** identifies a check that has not been completed.

Source inspection and automated tests do not establish human visual acceptance or model behavior.

## Support matrix

| Area                            | Status             | Evidence or remaining check                                                                                                                                   |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                         | Automated          | Minimum `>=26.0.0` in `package.json`; see [Node.js 26 validation](#nodejs-26-validation).                                                                     |
| Pi host                         | Automated          | Pi `1.6.0` and TypeBox `1.4.7`; actual `DefaultResourceLoader` discovery, skill-command expansion, and tool execution pass the package smoke tests.           |
| MCP stdio                       | Automated          | Official SDK client and subprocess tests cover the standalone tools, book edits and reads, cancellation, viewer cleanup, and an installed tarball without Pi. |
| Mermaid                         | Declared           | Version `12.3.0`; see the [accepted headers](../README.md#supported-mermaid-diagrams) and [family validation](#mermaid-1230-family-validation).               |
| Hand-drawn output               | Source + Automated | Rough.js `4.6.6`; source trace below plus real rough paths, fixed-seed redraws, markers, styles, and isolated SVG IDs checked in Chromium.                    |
| KaTeX                           | Automated          | Version `0.19.1` with nested copies overridden; browser math/security checks pass and `npm audit` reports zero vulnerabilities.                               |
| Skill resources                 | Automated          | Frontmatter, relative local links, strict schema fixtures, allowlist, and connected walkthrough checks pass `tests/skill.test.ts`.                            |
| Built local and tarball loading | Automated          | `npm run test:package` loads actual local and extracted npm-tarball resources and viewer assets without external browser requests.                            |
| Human visual acceptance         | Unverified         | Text size, hand-drawn style, responsive layout, and explanation clarity require user review.                                                                  |
| Trusted LAN IPv4                | Source + Automated | Tests and same-host private-interface Chromium smoke pass on macOS; physical second-device access remains unverified.                                         |
| Remote access                   | Unverified         | SSH forwarding, containers, and WSLg/Windows browser routing need environment-specific checks.                                                                |
| Active-agent authoring          | Authoring trial    | Two fresh cases use the revised skill and separate document IDs; automatic skill selection and broader model reliability remain unverified.                   |

## Mermaid 12.3.0 family validation

- **Declared:** The [18-family matrix](../README.md#supported-mermaid-diagrams) is the allowlist for the pinned distribution, including current aliases in the table. Registry IDs alone do not qualify for support. A future Mermaid upgrade must review new or missing entries rather than accepting them automatically.
- **Declared:** Pi and MCP apply the same source policy, preserve the exact source, and do not parse the Mermaid body at save time. Schema version 1, byte limits, and revision behavior are unchanged. The production Viewer parses and renders locally; a malformed body can save but causes a slide-local error. `focusNodes` remains flowchart-only. See the [downgrade instructions](../README.md#downgrade-without-losing-source) for older readers.
- **Automated (discovery only):** An inventory pass on WSL used Mermaid `12.3.0`, Chromium `159.0.8154.6`, and Node.js `26.11.1`. It exercised 37 public registry IDs under the Viewer CSP. Basic fixtures retained labels and nonzero geometry for every target header, including both flowchart and state headers and all five C4 headers. Journey produced temporary HTML elements in addition to usable SVG text. Event Modeling required HTML for event labels, so those labels did not survive filtering. The discovery bypassed storage validation and used benign fixtures; it does not establish Pi or MCP round trips, final production rendering, or safety for all optional syntax. Local scratch evidence is under ignored `test-results/mermaid-inventory/`.

### Delivery verification

Local integration checks used Node.js `26.11.1`, npm `11.20.0`, Mermaid `12.3.0`, Playwright `1.65.1`, and headless Chromium `159.0.8154.6` on WSL.

- `npm run ci` passed TypeScript, format and lint checks, 330 unit tests, and the production build. Pi and MCP round-trip exact Mermaid source for every supported header. The registry test classifies all bundled entries without enabling exclusions.
- `npm run test:browser` covered all 24 accepted headers. It checks visible labels and geometry, mixed-deck navigation and camera controls at 390px and 1440px, independent instances and local markers, live updates, local error recovery, and SVG boundaries. The sequence regression checks that arrowheads and number badges use the message line color after local marker IDs are renamed. The pre-existing flowchart focus and Rough.js checks remain required. The browser suite emits `test-results/mermaid-types-*/mixed-xychart-{390,1440}.png` and `test-results/mermaid-types-*/sequence-walkthrough-{390,1440}.png` by default.
- `npm pack --dry-run` and `npm run test:package` passed. Package smoke rendered a sequence slide in packed and local Pi and in standalone MCP, and verified Pi skill discovery and explicit `/skill` command expansion without a model call.

Run these same commands in a clean disposable checkout; the pull request records results against the exact delivery commit. No private Viewer URL or user document is retained. Neither this evidence nor the inventory establishes automatic skill selection, other browser engines, or human acceptance. See the [diagram family acceptance checks](acceptance.md#diagram-family-acceptance).

## Node.js 26 validation

CI tests the exact minimum (`26.0.0`) and the latest Node.js 26 release (`26`).
Before the Mermaid family expansion, local verification on Ubuntu under WSL2 passed on Node.js `26.0.0` and `26.11.1`:

- `npm ci` and `npm run ci` passed, including all 267 unit tests and the
  production build.
- `npm run test:browser` passed all 72 Chromium tests on both versions.
- `npm pack --dry-run` and `npm run test:package` passed, including local and
  tarball Pi loading and standalone MCP installation without Pi.

A separate headed Chromium check on Node.js `26.11.1` passed three viewer tests
using Wayland after a successful display connection and round trip. This check
used Linux Chromium and does not verify Windows browser routing.

## Shared diagram camera

Sketchbook uses `@narumitw/diagram-viewer/core` from npm version `0.4.0` for
zoom, pan, and focus-region geometry. Vite bundles the core and includes its
MIT license in `dist/web/THIRD_PARTY_LICENSES.md`. The installed Pi and MCP
packages do not fetch the viewer from npm or require an adjacent checkout.
Sketchbook still owns Mermaid configuration, SVG sanitization, frame sizing,
the toolbar, source view, and native and fallback fullscreen.

Validation on Node.js `26.11.1` covered 248 unit tests, 73 Chromium tests, and
local and packed Pi and standalone MCP smoke tests. The browser suite checks
that Reset returns to native size, large diagrams can zoom out to fit, wheel
zoom steps do not drift, and controls recover after a resize leaves no usable
graph area. It also checks that hidden diagrams ignore input and focus slides
reuse the same SVG. Package smoke tests verify that the bundled viewer makes
no external browser requests.
Other browser engines, physical touch devices, and human visual acceptance
were not verified for this change; see the [human browser review](acceptance.md#human-browser-review).

## Diagram Design HTML and static SVG

The Viewer uses the pinned Diagram Design light color roles and editorial type for all books. Default-paper HTML aligns to the book's text edge; custom palettes and layout remain inside their own pages. The Viewer and its isolated HTML frames share bundled font declarations. Fontsource's Unicode ranges limit font requests to matching text, including Traditional Chinese. The HTML validator still rejects authored `@font-face`, CSS imports, and external resource URLs. The trusted font declarations only point to bundled files, and font license texts ship in `dist/web/EDITORIAL_FONT_LICENSES.md`.

A book can combine entire Diagram Design HTML outputs as blocks. Validation runs before saving and again before displaying a block. An isolated frame has its own styles, permits no scripts, and grows with the page; it does not load external assets, use the diagram camera, or receive the Viewer access token. Existing SVG slides render as standalone images in a scroll region; the SVG source is not inserted into the Viewer DOM. Only Mermaid keeps the diagram camera and toolbar. Older releases may not read records with the new block or slide types. See the [Diagram Design handoff](acceptance.md#diagram-design-handoff) for host and visual checks that require separate evidence.

## Historical compatibility checks

These results describe earlier revisions, not the current support contract.
Earlier baseline verification produced these results:

- `npm run ci` passed on Node.js `22.19.0` and `26.8.2`, including formatting/lint checks, 115 of 115 Vitest tests across six files, and production builds.
- `npx vitest run tests/skill.test.ts` passed 15 of 15 tests independently on Node.js `26.8.2`.
- `npm run test:browser` passed 26 of 26 Chromium tests on both Node.js `22.19.0` and `26.8.2`.
- Compact-frame checks cover a single current-slide title, a bounded viewport, 44-pixel toolbar controls, bottom arrows, labelled position dots, independent selection, and hidden single-slide navigation.
- Camera checks cover initial Fit without upscaling, native-size Reset, zoom bounds, modified-wheel zoom, ordinary document scrolling, pointer capture, resize modes, source view, and listener/observer cleanup.
- Fullscreen checks exercise the native browser API and rejected/unavailable-API fallback, focus restoration, inert/scroll restoration, source changes, unmount, and late native-request completion.
- `npm run test:package` passed actual host/resource discovery and isolated installation checks on Node.js `22.19.0` and `26.8.2` in `scripts/package-smoke.ts`.
  - `DefaultResourceLoader` discovers the bundled skill.
  - `session.followUp(...)` expands a queued skill command without a model call.
  - Real Pi tool-schema validation and write/read/open execution succeed.
  - Chromium loads built local and extracted-tarball assets without external requests.
  - Session shutdown closes the viewer listener.
- `npm audit` reported zero vulnerabilities after the KaTeX override.

`npm pack --ignore-scripts --dry-run --json` confirmed the extension, viewer, fonts, third-party licenses, skill, and retained documentation are included, without source tests, workspace documents, or host implementation copies.
A fresh `npm ci --ignore-scripts` also completed successfully.
No registry publication or release operation is part of these checks.

### Connected-slide update

Verification on Node.js `26.8.2` on 2026-11-07 produced these results:

- `npm test -- tests/skill.test.ts` passed 26 of 26 tests, including duplicate-overview and broken-connection mutations.
- `npm run ci` passed formatting/lint, TypeScript checks, 126 of 126 Vitest tests across six files, and production builds.
- The focused bundled-slide browser checks passed 2 of 2 tests; `npm run test:browser` passed all 26 Chromium tests.
- `npm pack --dry-run` and `npm run test:package` passed, including local and tarball skill loading, viewer assets, and shutdown.

The update changes explanations and authoring rules, not diagram sources, stable IDs, runtime code, or the document schema.
Fixture-specific assertions check expected components, handoff steps, labels, and recovery paths; they do not validate the meaning of arbitrary decks.
Reader comprehension and real-model behavior remain unverified; see the deck continuity review in [acceptance](acceptance.md).

### Sketchbook rename

Verification on Node.js `26.8.2` on 2026-11-07 produced these results:

- `npm run ci` passed formatting/lint, TypeScript checks, all 126 Vitest tests, and production builds.
- `npm run test:browser` passed all 26 Chromium tests, including the Pi Sketchbook header and page title.
- `npm pack --dry-run` produced the expected `pi-sketchbook` package manifest and renamed skill paths.
- `npm run test:package` passed local and extracted-tarball loading, renamed skill-command expansion, all three `sketchbook_*` tools, `.pi/sketchbook/` storage, viewer branding, and shutdown.

The rename keeps document schema version 1 and does not move existing workspace documents automatically.
Node.js `22.19.0` was not rerun for this rename; its results above are earlier baseline evidence.
GitHub repository renaming, npm name ownership, publication, and human acceptance remain external checks in [acceptance](acceptance.md).

### Article structure and readability

Verification on macOS with Node.js `26.11.1`, Pi `1.5.0`, and Playwright `1.65.0` on 2026-11-07 produced these results:

- `npm run ci` passed formatting, TypeScript checks, 142 of 142 unit tests across seven files, and production builds.
- `npm run test:browser` passed 37 of 37 Chromium tests, including every slide in three complete articles at 390px and 1440px.
- `npm pack --dry-run` and `npm run test:package` passed local and extracted-tarball discovery, tool execution, browser assets, and shutdown.
- `npm audit` reported zero vulnerabilities.
- Stable H2 deck chapters and H3 slide titles, legacy Markdown heading normalization, explanation heading scope, 16px explanation text, technical-name wrapping, and compact bounded frames passed regression checks.
- Existing camera, source-text, SVG sanitization, native/fallback fullscreen, and lifecycle checks remain passing.

The complete-article cases cover all nine bundled slides and all five slides in `tests/fixtures/agent-substrate.json` at both widths, for 28 slide/viewport checks.
They measure every SVG text label in the default fitted view, before Reset or Zoom.

| Article                    | Minimum label at 390px | Minimum label at 1440px |
| -------------------------- | ---------------------- | ----------------------- |
| Architecture example       | 12.62px                | 14.11px                 |
| Process example            | 12.37px                | 12.37px                 |
| Agent Substrate regression | 12.34px                | 12.88px                 |

`test-results/article-review-*/` contains per-slide captures, complete initial/final pages, heading outlines, and label/frame measurements.
The capture helper waits for fonts and paint frames and checks PNG pixels inside every diagram viewport, so a blank full-page frame cannot pass only because an SVG exists in the DOM.
An independent agent review inspected the bundled examples and code; the main agent inspected the Agent Substrate article and all five slides at both widths.
These checks do not establish human visual or comprehension acceptance.
Node.js 22.19.0 was not rerun locally for this update; the CI matrix at the time included it.

On macOS, the existing exact-path tests require a physical temporary-directory path.
Run `export TMPDIR="$(cd "${TMPDIR:-/tmp}" && pwd -P)"` before the checks when TMPDIR contains the `/var` alias for `/private/var`.
The alias otherwise causes baseline path-equality failures; this update does not change storage path behavior.

### Automatic LAN viewer

Verification on macOS with Node.js `26.11.1` on 2026-11-08 produced these results:

- `npm run ci` passed formatting, TypeScript checks, 176 of 176 unit tests across seven files, and production builds.
- `npm run test:browser` passed all 37 Chromium tests with the automatic viewer URLs.
- `npm pack --dry-run` and `npm run test:package` passed local and extracted-tarball discovery, zero registered extension flags, automatic address selection, viewer assets, and shutdown.
- The 73 focused server/tool tests cover wildcard binding, all three private IPv4 ranges, excluded public/internal/IPv6 addresses, loopback URL fallback, duplicate interfaces, discovery failure, unchanged model inputs, token checks, and lifecycle cleanup.
  - Interface discovery is mocked for these unit cases so CI does not require a private address. The sockets still bind to wildcard IPv4.
  - Tests reject mismatched Origin values even when both the request Host and the other origin address are independently allowed.
- A separate smoke check used no host argument and automatically selected the host's real private IPv4 address with Chromium `158.0.8127.18` at 1440px and 390px.
  - `lsof` confirmed a wildcard IPv4 listener; both the detected private address and loopback served requests with their own matching Origin.
  - Bundled assets, Markdown, math, diagrams, slide navigation, authenticated 200/304 polling, and revision updates passed without external requests or page errors.
  - Missing/wrong/query-string tokens, wildcard/foreign Host values, mismatched Origin values, and write methods were denied.
  - Shutdown disconnected the browser and closed the listener while saved state and the last loaded browser content remained.
  - Ignored `test-results/auto-lan-smoke/` contains screenshots and a token-free report with built-source hashes.

The viewer now binds to `0.0.0.0` by default; no host configuration remains.
The returned URL uses the first detected non-internal private IPv4 address in operating-system interface order, or `127.0.0.1` if none is detected.
A loopback URL fallback does not restrict the wildcard listener to loopback.
Host validation is not client-IP filtering, and HTTP is unencrypted; use only trusted networks and operating-system firewall policy.
Physical second-device routing, firewall permissions, Wi-Fi isolation, VPN/virtual-interface selection, and human acceptance remain unverified.
The currently running Pi process needs `/reload` and a fresh `sketchbook_open` call to use the new built extension.
See the [LAN device handoff](acceptance.md#lan-device-handoff).
No firewall settings, router settings, publication, tags, or releases were changed.
The existing Vite chunk-size warning remains; this change does not alter the renderer bundle.

### Generation and reading-layout update

Verification on macOS with Node.js `26.11.1` and Pi `1.5.0` on 2026-11-08 produced these results:

- `npm run ci` passed formatting, TypeScript, all 193 unit tests across eight files, and production builds.
- `npm run test:browser -- --output=test-results/browser` passed all 61 Chromium tests.
  - Complete-article coverage includes 16 slides at each width, for 32 initial-fit slide/viewport checks.
  - Disclosure keyboard/tab order, native/fallback fullscreen, live source replacement and outside focus, 20-slide navigation, coarse-pointer help, touch scrolling, and enlarged-root-text wrapping passed.
- `npm pack --dry-run` and `npm run test:package` passed local and extracted-tarball loading, actual tool execution, bundled assets, math rendering, and shutdown.
  - The package smoke now opens the fixture's actual math slide instead of assuming that math appears in the first view.
- `npm audit --audit-level=low` reported zero vulnerabilities.
- The original saved walkthrough's SHA-256 stayed unchanged; no user document was rewritten.

| Article                    | Minimum label at 390px | Minimum label at 1440px |
| -------------------------- | ---------------------- | ----------------------- |
| Architecture example       | 12.61px                | 14.93px                 |
| Process example            | 12.63px                | 15.98px                 |
| Agent Substrate regression | 12.34px                | 12.88px                 |
| Viewer handoff trial       | 12.61px                | 15.98px                 |
| Receipt decision trial     | 12.63px                | 15.98px                 |

Every explanation uses at least 16px body text; the measured maximum unused graph-frame height is below the existing 64px bound.
Long fenced code remains in bounded horizontal scroll containers, not wrapped or truncated.
The article checks reach the right edge of each overflowing code block, preserve its text, and retain end-of-code captures; a default screenshot alone does not show every code column.
The complete article captures and every slide were inspected by agents at both widths, separately from the automated checks.
Node.js `22.19.0`, other browser engines, physical touch devices, and human acceptance were not rerun or established by this local update.
The CI matrix at the time included Node.js `22.19.0`.

The skill now requires source-supported arrow recipients, actions, direction, required order, decision inputs/outcomes, and useful contributions across decks.
`tests/fixtures/generation-cases.json` records explicit teaching facts and compact claim/contribution/issues reviews.
Known-failure tests cover wrong recipients, lost no-write outcomes, unsafe ordering, and redundant detail views without claiming a universal semantic evaluator.

The Viewer places graph and prose side by side when their 34rem/20rem flex bases fit the available card width.
They wrap into one reading column when space is insufficient, including enlarged root text.
At the default 16px root size, the combined bases are 864px; they scale with the font instead of relying on a fixed viewport breakpoint.
Fit still does not enlarge native SVGs, and inline height still follows SVG geometry within its bounds.
The measurements in this reading-layout update used the former compact toolbar: Fit, Fullscreen, and More controls, with zoom, Reset, source view, and input help in an inline disclosure.
The direct-toolbar restoration described below supersedes that control layout.
Footer Previous/Next labels, count, and position dots remain available, including a 20-slide case.

Controlled before/after checks use identical `readingFixture()` content against baseline `348c400`:

| Viewport                         | First paragraph offset before | After    | Fitted minimum before / after |
| -------------------------------- | ----------------------------- | -------- | ----------------------------- |
| 1440x1000 and 1280x960           | 540.38px                      | 109.56px | 15.98px / 15.98px             |
| 390x844, fine and coarse pointer | 611.52px                      | 577.02px | 15.98px / 15.98px             |

Offsets above are macOS measurements relative to the card top.
CI preserves the one-body-line improvement and unchanged-label requirements with frozen historical heading styles and the historical SVG inset/clamp formula.
Only system-font glyph measurements and intrinsic SVG dimensions are browser-specific; an isolated historical heading fixture prevents current header or descendant styles from changing the reference.
The frame reference uses the historical geometry formula, not the live frame height.
A pinned fixture SHA-256 requires identical text/source, and negative checks confirm that 16px of added header padding, title padding/borders, or frame whitespace fails the comparison.
The historical toolbar/hint/pagination spacing remains fixed; raw and same-font offsets are both recorded.
This avoids comparing Linux font geometry against an absolute macOS pixel coordinate.
SVG label checks also tolerate inter-tspan whitespace differences without changing label text or rendering policy.
Final review caught the initial fixed-pixel layout overflowing at 1024px with 20px root text; font-scaled wrapping and four width/root-font regression cases resolve it.
The mobile improvement is 34.5px, more than one 25.6px body-text line, without reducing graph labels or removing authored content.
Capture commands and raw geometry are reproducible with `scripts/capture-reading-layout.ts` and the committed baseline metrics.
Use a separate browser output directory so tests do not remove the retained before/after captures.

The first revised examples exposed genuine fitted-label failures: API validation measured 10.70px and the process decision measured 11.02px at 390px.
The examples were simplified into useful focused views, including separate revision and atomic-commit views; the label floor was not lowered.
The fresh Viewer authoring trial also needed a narrower request view after its first 390px result measured 11.01px.
These corrections are evidence that render success alone is insufficient, not evidence that future model outputs cannot fail.
The source-backed Viewer and unrelated package-receipt trials, their saved IDs/revisions, limits, and human handoff are recorded in [acceptance](acceptance.md#generation-and-reading-quality-handoff).
The existing user walkthrough was not rewritten.

## Direct diagram controls

The toolbar now shows Fit, Fullscreen, Zoom out, current zoom, Zoom in, Reset, and source view directly.
Input help is always visible, and there is no More controls disclosure.
Enabled buttons remain in keyboard order when the source changes or fullscreen is used.

Controlled captures on 2026-11-08 compare the former compact toolbar with the restored controls using identical `readingFixture()` content:

| Viewport                | First paragraph before / after | Toolbar height before / after |
| ----------------------- | ------------------------------ | ----------------------------- |
| 1440x1000 and 1280x960  | 109.56px / 109.56px            | 64.19px / 119.52px            |
| 390x844, fine pointer   | 577.02px / 650.42px            | 56.19px / 129.59px            |
| 390x844, coarse pointer | 577.02px / 609.48px            | 56.19px / 88.66px             |

The restored controls and help intentionally increase toolbar height. The earlier mobile paragraph-offset improvement is historical, not a target for the restored toolbar.
Historical comparison tests account for this toolbar-height change while retaining authored-content, heading, frame, and font checks. Normalize against the former compact toolbar, including its existing 8px mobile padding reduction, not the older toolbar height. The one-body-line improvement requirement and negative heading/frame checks remain unchanged. Separate padding and row-gap assertions guard toolbar spacing.
Graph labels remain unchanged at 15.98px for this compact fixture; all 12 captured compact/wide/tall views remain contained.
Before/after evidence is under `test-results/reading-layout/controls-before/` and `controls-after/`.
Agent review inspected the desktop and 390px compact views, including coarse-pointer help and toolbar wrapping with 20px root text. Physical-device behavior and human acceptance remain unverified.

Validation passed on Node.js 26.11.1 with local Chromium:

- Static checks, 193 unit tests, and the production build passed.
  - Unit tests use a canonical `TMPDIR` path on macOS; the default `/var` alias otherwise causes three unrelated path-equality failures against `/private/var`.
- All 63 browser tests passed, including direct keyboard access, live-source focus recovery, independent decks, native/fallback fullscreen, touch scrolling, and enlarged root text at 390px.
- The browser suite retains complete-article and per-slide evidence under `test-results/browser/`.
- The 11 focused reading-layout tests also passed on macOS and in a Linux arm64 container with Node.js 26.11.1. A mutation that restores the incorrect toolbar normalization fails the new regression assertion by exactly 8px.

## Repository review fixes

Verification on macOS with Node.js `26.11.1` on 2026-11-12 produced these results:

- `npm run ci` passed formatting, TypeScript checks, all 205 unit tests across nine files, and production builds.
- `npm run test:browser -- --output=test-results/browser` passed all 70 Chromium tests.
- `npm pack --dry-run` and `npm run test:package` passed package checks, local and extracted-tarball discovery, viewer assets, and shutdown.
- `npm run check` and `npm test` also passed on Node.js `22.23.4`, including all 205 unit tests.

The new regressions cover capability-preserving fragment navigation, footnote references and return links, unique targets across Markdown instances, and literal percent-containing footnote identifiers.
Keyboard checks cover bounded Shift + arrow camera movement, source scrolling on both axes, fullscreen focus order, and unchanged ordinary slide navigation and touch scrolling.
Disposable Git fixtures verify that pre-commit checks use staged blobs, configuration, and ignore rules without changing the working tree or index.
Storage checks verify recovery from a failed first ignore-file write and preservation of pre-existing ignore files.

The existing Vite chunk-size warning remains.
Node.js `22.19.0`, other browser engines, screen-reader announcements, physical devices, and human acceptance were not verified locally for this update.
The CI matrix at the time still included Node.js `22.19.0`, the former minimum. External acceptance requirements in [acceptance](acceptance.md) remain unchanged.

## Standalone MCP server

Verification on Node.js `22.19.0` and `26.11.1` on 2026-11-12 produced these results:

- `npm run ci` passed formatting/lint, TypeScript checks, all 257 Vitest tests across 13 files, and production builds.
- MCP protocol tests cover the three shared schemas, JSON text and structured output, revisions, conflicts, invalid input, Mermaid policy, complete large reads, authentication, cancellation, and disconnect cleanup.
  - The adapter handles numeric-zero and empty-string request IDs explicitly because SDK `1.32.2` ignores those cancellation IDs.
  - Calls and cancellation notifications in one stdio chunk are checked before storage entry. Tests cover creates, replacements, numeric and string IDs, unknown IDs, and independent requests in one batch.
  - Cancelled requests cannot bypass storage cancellation checks before the atomic commit point.
- Real stdio subprocess tests cover the process working-directory default, absolute and relative `--cwd` overrides, argument failures, protocol-only stdout, and viewer cleanup on EOF, SIGINT, and SIGTERM.
- `npm run test:package` passed Pi local/tarball loading and an isolated npm installation of the MCP executable without Pi.
  - `npx` resolves the installed package executable. The installed MCP tools create, read, replace, reject a conflict, and open a document in the selected workspace.
  - Chromium renders the installed viewer assets, and client shutdown closes the listener.
- The full Chromium regression suite passed all 70 tests on Node.js `26.11.1`.
- `npm pack --dry-run --ignore-scripts` includes the MCP executable and viewer assets without source tests or host implementations.
- `npm audit` reported zero vulnerabilities.

The viewer and document format are unchanged. Pi still injects its host mutation queue; MCP uses a local process-wide queue.
Claude Desktop and Cursor UI behavior, physical LAN access, and human acceptance remain unverified; see the [MCP client handoff](acceptance.md#mcp-client-handoff).

## Progressive Sketchbook book tools

Verification on checkout `9940695b24a820205fc536c621a3ae44ad0ca849` with Node.js `26.11.1` on 2026-11-21 produced these results:

- All 35 tests in `tests/mcp.test.ts` and `tests/mcp-cli.test.ts` passed. The MCP protocol test checks that `sketchbook_read_book` returns no book before the first edit, scoped `sketchbook_edit` calls advance the book revision, a stale revision is rejected, and the original document stays unchanged.
- `npm run test:package` passed the book read and edit smoke checks for Pi and the standalone MCP executable.

## Fixture coverage

[Architecture walkthrough](../skills/sketchbook-create-diagrams/assets/architecture-walkthrough.json) provides four connected save-boundary views and a separate caller URL/browser-request handoff.
It includes subgraphs, Chinese text, and an independent one-slide deck.
[Process walkthrough](../skills/sketchbook-create-diagrams/assets/process-walkthrough.json) provides a replacement overview, a serialized revision decision, and an independent interrupted-response check.
Both flowchart walkthroughs include Markdown prose, inline/display LaTeX, fenced TypeScript, an opening H2, and a final conclusion without redundant start/end reminders.
[Sequence walkthrough](../skills/sketchbook-create-diagrams/assets/sequence-walkthrough.json) teaches the order of one request and its response without `focusNodes`.
Earlier complete-article browser checks covered the eight bundled flowchart slides, five Agent Substrate slides, and three fresh authoring slides at narrow and desktop widths.
Controlled compact/wide/tall layout and 20-slide navigation cases are separate from the teaching articles; the large cases do not inherit the compact label-size target.
The skill test protects known outline and meaning regressions, not arbitrary narrative quality.

## Rendering source trace

Source inspection found this path in the installed Mermaid 12.3.0 distribution:

1. The Viewer uses `look: "handDrawn"` and `handDrawnSeed: 42` for flowcharts. It uses `securityLevel: "strict"` and `htmlLabels: false` for all families.
2. `node_modules/mermaid/dist/chunks/mermaid.core/chunk-AXFCVDMN.mjs:4315` defines `squareRect`, which calls `drawRect`.
3. The same chunk at lines 1864–1883 imports `rough17` from `roughjs` and calls `rough17.svg(shapeSvg)` and `rc.rectangle(...)` in the `node.look === "handDrawn"` branch.
4. `node_modules/roughjs/package.json` identifies Rough.js 4.6.6.

The Viewer checks Mermaid source before staging a diagram in the DOM. It does not attach Mermaid's event bindings. DOMPurify and SVG filtering remove active markup and external references; definition references must point within the same sanitized SVG. Style rules stay scoped to that SVG, and the inspected SVG is inserted as a node, not reparsed as HTML.
`tests/browser/viewer.spec.ts` observes calls to the actual bundled Rough.js renderer while preserving its output, and checks real paths, styles, markers, fixed-seed redraws, and isolated SVG IDs.
The browser suite also checks native-size label readability after Reset at a 390-pixel viewport and rejects quoted or escaped image metadata before Mermaid can request resources.
Server and browser use the same source policy in `src/mermaid-policy.ts`.
Diagram types and aliases outside the [header table](../README.md#supported-mermaid-diagrams) remain outside the allowlist even if the dependency can parse them.

A representative 66-node, 65-edge flowchart completed in 444 ms in one local Node.js 22.19.0/Chromium run.
This is a single observation, not a performance guarantee or CPU-isolation claim.
Initial Fit can reduce large-graph labels below readable size; Reset, zoom, and panning provide access to native-size content.
The frame does not rewrite Mermaid orientation or node content.
The browser tests save `rough-path-evidence.json`, `large-flowchart-timing.json`, and fixture screenshots under ignored `test-results/`; CI retains these as artifacts.
Vite reports large Mermaid chunks over 500 kB; lazy renderer chunks remain local, and bundle size is not a passed performance target.

## Reproduce

Use Node.js 26.0.0 or later.

```sh
node --version
npm ci
npm run ci
npx playwright install chromium
npm run test:browser -- --output=test-results/browser
npm pack --dry-run
npm run test:package
npm audit
```

Repeat these checks after dependency or rendering changes.
See [acceptance and external handoff](acceptance.md) for checks that automation does not complete.
