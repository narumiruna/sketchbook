# Follow-up issue drafts

These issues are not filed. Keep the current implementation until the corresponding verification passes.

## Retire the SDK cancellation workaround

The pinned MCP SDK 1.32.2 ignores cancellation notifications for falsy request IDs. Sketchbook tracks its own abort controllers so IDs `0` and `""` still cancel. When evaluating an SDK upgrade, check cancellation for both IDs and notifications in the same stdio chunk as a request. Remove only the adapter state that the upgraded SDK makes redundant. Run `npx vitest run tests/mcp-cancellation.test.ts tests/mcp.test.ts` and keep the cancellation-before-write and independent-request cases passing.
