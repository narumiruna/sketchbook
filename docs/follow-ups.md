# Follow-up issue drafts

These issues are not filed. Keep the current implementation until the corresponding verification passes.

## Retire the SDK cancellation workaround

The pinned MCP SDK 1.32.2 ignores cancellation notifications for falsy request IDs. Sketchbook tracks its own abort controllers so IDs `0` and `""` still cancel. When evaluating an SDK upgrade, check cancellation for both IDs and notifications in the same stdio chunk as a request. Remove only the adapter state that the upgraded SDK makes redundant. Run `npx vitest run tests/mcp-cancellation.test.ts tests/mcp.test.ts` and keep the cancellation-before-write and independent-request cases passing.

## Retire the camera wheel adapter

Sketchbook overrides only the zoom-out step in `@narumitw/diagram-viewer` 0.4.0; the core handles zoom-in and the browser handles ordinary scrolling. The core skips canceled events. When a wheel event cannot be canceled, the adapter stops later listeners so the core does not apply another zoom step. Check whether a later core version can use the same zoom-out factor and anchor without this adapter. Before removing it, run `npx vitest run tests/diagram-view.test.ts` and `npx playwright test tests/browser/diagram-controls.spec.ts`. Verify single-step zoom-out for both cancelable and non-cancelable events, pointer anchoring, and ordinary scrolling.
