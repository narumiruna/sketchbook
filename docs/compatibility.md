# Compatibility evidence

## Evidence labels

- **Declared** identifies the support contract or a pinned dependency, not a passed test.
- **Source** identifies an inspected implementation or dependency path.
- **Automated** identifies a completed check and its observed result.
- **Authoring trial** identifies a bounded active-agent generation and review, not automatic skill discovery or general model reliability.
- **Unverified** identifies a check that has not been completed.

Source inspection and automated tests do not establish human visual acceptance or model behavior.

## Support matrix

| Area                            | Status             | Evidence or remaining check                                                                                                                         |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                         | Automated          | Minimum `>=22.19.0` in `package.json`; CI, build, and local/tarball smoke tests pass on `22.19.0` and `26.8.2`.                                     |
| Pi host                         | Automated          | Pi `1.5.0` and TypeBox `1.3.27`; actual `DefaultResourceLoader` discovery, skill-command expansion, and tool execution pass the package smoke test. |
| Mermaid                         | Automated          | Version `12.3.0`; flowcharts, subgraphs, Chinese text, long labels, and every bundled example slide pass the Chromium suite.                        |
| Hand-drawn output               | Source + Automated | Rough.js `4.6.6`; source trace below plus real rough paths, fixed-seed redraws, markers, styles, and isolated SVG IDs checked in Chromium.          |
| KaTeX                           | Automated          | Version `0.19.1` with nested copies overridden; browser math/security checks pass and `npm audit` reports zero vulnerabilities.                     |
| Skill resources                 | Automated          | Frontmatter, relative local links, strict schema fixtures, allowlist, and connected walkthrough checks pass `tests/skill.test.ts`.                  |
| Built local and tarball loading | Automated          | `npm run test:package` loads actual local and extracted npm-tarball resources and viewer assets without external browser requests.                  |
| Human visual acceptance         | Unverified         | Text size, hand-drawn style, responsive layout, and explanation clarity require user review.                                                        |
| Trusted LAN IPv4                | Source + Automated | Tests and same-host private-interface Chromium smoke pass on macOS; physical second-device access remains unverified.                               |
| Remote access                   | Unverified         | SSH forwarding, containers, and WSLg/Windows browser routing need environment-specific checks.                                                      |
| Active-agent authoring          | Authoring trial    | Two fresh cases use the revised skill and separate document IDs; automatic skill selection and broader model reliability remain unverified.         |

## Completed checks

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
Node.js 22.19.0 was not rerun locally for this update; the existing CI matrix provides a separate check.

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
The existing CI matrix provides the separate Node.js compatibility check.

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

## Fixture coverage

[Architecture walkthrough](../skills/sketchbook-explain-diagrams/assets/architecture-walkthrough.json) provides four connected save-boundary views and a separate caller URL/browser-request handoff.
It includes subgraphs, Chinese text, and an independent one-slide deck.
[Process walkthrough](../skills/sketchbook-explain-diagrams/assets/process-walkthrough.json) provides a replacement overview, a serialized revision decision, and an independent interrupted-response check.
Both include Markdown prose, inline/display LaTeX, fenced TypeScript, an opening H2, and a final conclusion without redundant start/end reminders.
All eight bundled slides, five Agent Substrate slides, and three fresh authoring slides have complete-article browser coverage at narrow and desktop widths.
Controlled compact/wide/tall layout and 20-slide navigation cases are separate from the teaching articles; the large cases do not inherit the compact label-size target.
The skill test protects known outline and meaning regressions, not arbitrary narrative quality.

## Rendering source trace

Source inspection found this path in the installed Mermaid 12.3.0 distribution:

1. `src/web/diagram.tsx` sets `look: "handDrawn"`, `handDrawnSeed: 42`, `securityLevel: "strict"`, and `htmlLabels: false`.
2. `node_modules/mermaid/dist/chunks/mermaid.core/chunk-AXFCVDMN.mjs:4315` defines `squareRect`, which calls `drawRect`.
3. The same chunk at lines 1864–1883 imports `rough17` from `roughjs` and calls `rough17.svg(shapeSvg)` and `rc.rectangle(...)` in the `node.look === "handDrawn"` branch.
4. `node_modules/roughjs/package.json` identifies Rough.js 4.6.6.

`src/web/diagram.tsx` uses DOMPurify's SVG profile, removes active/external elements and link attributes, and retains only local fragment CSS URLs.
`tests/browser/viewer.spec.ts` observes calls to the actual bundled Rough.js renderer while preserving its output, and checks real paths, styles, markers, fixed-seed redraws, and isolated SVG IDs.
The browser suite also checks native-size label readability after Reset at a 390-pixel viewport and rejects quoted or escaped image metadata before Mermaid can request resources.
Server and browser use the same source policy in `src/mermaid-policy.ts`.
Other Mermaid diagram types remain outside the allowlist even if the dependency can parse them.

A representative 66-node, 65-edge flowchart completed in 444 ms in one local Node.js 22.19.0/Chromium run.
This is a single observation, not a performance guarantee or CPU-isolation claim.
Initial Fit can reduce large-graph labels below readable size; Reset, zoom, and panning provide access to native-size content.
The frame does not rewrite Mermaid orientation or node content.
The browser tests save `rough-path-evidence.json`, `large-flowchart-timing.json`, and fixture screenshots under ignored `test-results/`; CI retains these as artifacts.
Vite reports large Mermaid chunks over 500 kB; lazy renderer chunks remain local, and bundle size is not a passed performance target.

## Reproduce

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
