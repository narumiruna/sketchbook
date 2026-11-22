# Sketchbook guidelines

## Documentation

- Update the [document format](skills/sketchbook/references/document-format.md) and affected examples when tool inputs, outputs, or stored records change.
- Update the [README](README.md) when installation, configuration, or user-facing commands change.

## Commands

- Run commands from the repository root with Node.js 26.0.0 or later and install dependencies with `npm ci`.
- Run `npm run check` for Biome and TypeScript checks.
- Use `tar` and network access to the pinned Diagram Design archive for source builds.
- After `npm ci`, use `prek run biome-check tsc-rs --all-files` to run Biome and type-check `tsconfig.tests.json` without writing changes.
- Review changes to `.github/` after running `prek run --all-files`, which also runs Zizmor with `--fix`.

## Boundaries

- Get separate authorization before running paid model evaluations, merging a release version PR, creating or pushing version tags, dispatching the release workflow, or publishing to npm; see [acceptance](docs/acceptance.md).

## Security

- Use disposable workspaces and synthetic documents for tests, and keep Viewer URLs, access tokens, and user content out of logs and review artifacts.
- Keep the Viewer read-only and imported diagrams offline; do not enable scripts or external resources in diagram content.

## Testing

- Run `npm run ci` for code changes to check formatting, lint, types, unit tests, and the build; add regression tests for changed behavior.
- For Viewer changes, install Chromium with `npx playwright install chromium` if needed, then run `npm run test:browser -- --output=test-results/browser`.
- For install, build, or bundled skill changes, run `npm pack --dry-run` and `npm run test:package` after building to verify package contents and installation paths.
- Report automated rendering separately from human visual acceptance, physical LAN access, and automatic skill selection.

## Repository structure

- Keep validation and storage behavior shared by Pi and MCP; preserve separate revision checks for the original document and its book sidecar.
- Edit Viewer source in `src/web/` and shipped authoring instructions in `skills/sketchbook/`; do not hand-edit generated `dist/` or `skills/sketchbook/upstream/`.
