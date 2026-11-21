# Keep development checks independent of what they inspect

## Staged checks

- Run the installed Biome and local hook code, not executables from the staged snapshot. The staged configuration and ignore rules still determine Biome's checks.
- Read raw index blobs without checkout filters so both checks see the bytes Git will commit. Treat filenames as bytes during snapshot creation; they can contain tabs, newlines, or invalid UTF-8. Check both the staged comments and the staged baseline without writing to the index or worktree.
- The hook tests use disposable repositories without inheriting the user's Git configuration or index/worktree overrides. The release tests likewise use a repository without remotes and an unavailable registry.

## Runtime checks

- The package smoke exercises Pi's public skill-command expansion with model network access disabled. It passes npm's update-notifier setting explicitly to the MCP stdio client because the SDK does not normally forward npm configuration variables. npm notices are not MCP diagnostics.
- Browser tests use a test-only coordinator around the real read-only server, built assets, and stored documents. They observe calls to the bundled Rough.js renderer instead of substituting its output. Browser boundary tests simulate a compromised response after a real disk-backed read or substitute renderer output before SVG sanitization; neither path needs another production write API.
- The shared camera unit tests cover the adapter contract, including a callback before the controller is assigned. Geometry and gestures are checked upstream and through browser integration. Browser geometry checks wait for the resize observer, cover both the rem-based height cap and the 70vh cap at larger text sizes, and tolerate SVG label text split across adjacent tspans.
- Keep the historical reading reference independent of current CSS. Rebuild the heading from commit `348c400` in an isolated shadow root; use current system glyph metrics and the same source SVG geometry rather than an absolute macOS pixel coordinate on Linux. Normalize the controls restoration but not the earlier mobile padding reduction from 0.6rem to 0.35rem at a 16px root. Independently check toolbar padding and row gap so normalization does not hide regressions.
- The MCP cancellation tests send a whole batch in one stdio chunk to exercise cancellation before the tool handler runs. Tool integration tests use the official client because it validates RPC results against the advertised schemas. Use a canonical temporary directory when comparing storage paths so the macOS `/var` alias does not change the expected path.

## Teaching fixtures

- Mermaid registry fixtures cover every supported header and alias using registry IDs from the pinned version. The reading-layout fixture models a client submitting input, a check accepting it, and output being saved. It measures layout, not a production workflow.
- Article and skill regression checks protect the reviewed examples: heading order, prerequisite terms, and fixture-specific label and claim checks. They cannot measure rendered label pixels or establish the truth or quality of arbitrary prose. Keep negative claim fixtures schema-valid so they exercise the intended check rather than being rejected for format alone.
