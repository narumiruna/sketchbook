# Preserve session and write boundaries

## Decision

- Pi uses `session_shutdown` to close viewer resources. Pi emits it for reload, new, resume, and fork as well as shutdown.
- The listener reports startup errors to `open()` and stores runtime failures for later calls. Shutdown waits for an in-progress listen attempt even if it rejects: a server object can still need cleanup.
- The MCP client must be able to recover from parse and request errors. Keep stdout protocol-only and use stderr for diagnostics. Advertise an object root for the MCP result schema; keep the shared success and failure shapes inside it. Return the complete stored JSON over MCP. The Pi text preview is bounded, and its streaming UTF-8 decoder drops a partial character rather than inserting a replacement at the byte limit.
- Keep runtime MCP diagnostics generic: do not log protocol payloads, document content, or viewer capability URLs. Use a generic message at the viewer's HTTP error boundary so unexpected failures do not expose filesystem paths, credentials, or request data. Tool errors must not include viewer capability URLs; the shared formatter truncates messages to 2,000 characters but does not redact them.
- Retain early cancellation only through the next microtask. A notification in the same stdio chunk can reach its handler before the queued call handler, but unrelated request IDs must not stay in memory. Schedule transport closure after recording the close promise so `onclose` can reenter without starting a second close.
- Queue mutations by canonical path so equivalent paths share a queue. A failed mutation does not block its successor; cleanup may remove only its own entry. Snapshot the input before the first await so the caller cannot change a pending write. Atomic rename is the commit point: report cancellation before it, never after a successful rename.

## Verification

The session lifecycle, request-ID cancellation, preview limits, same-path queue, and atomic-write tests guard these boundaries. See [compatibility evidence](../compatibility.md#standalone-mcp-server) and the [SDK cancellation follow-up](../follow-ups.md#retire-the-sdk-cancellation-workaround).
