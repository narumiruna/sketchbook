# Isolate diagram rendering and camera state

## Render and sanitize independently

- The shared source policy matches documented headers rather than Mermaid's permissive detector prefixes. Verify that Mermaid selects that same renderer before staging it. Reject the whole optional YAML metadata syntax rather than enumerating keys, since quoted and escaped keys can select resource renderers. Permit only simple style declarations because some renderers put those statements into a live stylesheet before cleanup.
- Render serially across decks because Mermaid shares mutable state. Continue the queue after failures. Some renderers measure labels in temporary HTML, so their text sanitizer must not preserve resource or style attributes. Only sanitized SVG enters the visible stage. The viewer CSP permits inline styles for Mermaid SVG and KaTeX, but not inline scripts.
- SVG fragment references resolve against document-wide IDs. Give each SVG definition a unique ID while preserving safe suffixes used by sequence marker styles. Keep flat style rules and scope the entire selector list to the SVG with `:is()`; a prefix before only the first branch does not scope the rest.
- Keep one diagram frame in the DOM. The in-page fullscreen fallback isolates siblings instead of copying the SVG and introducing duplicate IDs. When replacing the source disables camera controls, preserve keyboard access by moving focus within the toolbar.

## Separate layout from camera

- The shared camera reads its viewport padding from CSS. The host's width-fit height calculation uses the same inset and intrinsic SVG size, never zoom or observed height; CSS bounds the result.
- Register the host resize observer before the shared camera attaches its observer. Schedule the host layout in an animation frame so its height write does not reenter resize delivery.
- Look up author-specified flowchart node IDs using Mermaid's generated prefix and numeric suffix. Clear the pending mode before calling camera setters because they can publish state synchronously. Set the mode for every new slide even when two slides share equal focus bounds.

## Keep Markdown navigation and diagnostics local

- Keep article H2+ headings unchanged unless a legacy block begins at H1; shift that block as an outline. Place slide explanation headings below H3.
- Read formula diagnostics separately from the markup: KaTeX can return a colored fallback instead of a dedicated error span.
- Move focus and scroll for in-page links without replacing the viewer's fragment capability. Generated footnote IDs contain their encoded identifiers literally. For other links, try the decoded fragment first but allow literal IDs, including when decoding fails.

## Verification

See the [rendering source trace](../compatibility.md#rendering-source-trace) and [camera follow-up](../follow-ups.md#retire-the-camera-wheel-adapter) for the renderer and shared-camera contracts.
