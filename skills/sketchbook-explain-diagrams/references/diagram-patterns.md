# Article and diagram patterns

Plan the whole article before its slide sequences.
Subgraphs are visual groups, not interactive expansion.

## Source and meaning

Before drawing, identify the reader's main question, important execution or trust boundaries, and the fact each diagram must make visible.

- Trace every arrow to an inspected source location or an explicit supplied teaching fact.
  - Check sender, receiver, action or data, direction, and required order against that evidence.
  - Distinguish component relationships from process order; a dependency arrow does not establish which operation runs first.
  - Separate a returned value from the action its caller later performs; returning a URL to a caller is not a browser request.
- Make each important decision's inputs, outcomes, and relevant side effects visible in the graph.
  - Use short input and branch labels, including rejection or no-write outcomes, rather than a full code expression in a node.
  - Show the handoff that enables the next operation and any ordering boundary that prevents an unsafe action.
- Mark assumptions and omitted paths that affect the answer.
  - Do not use implementation claims for a teaching model unless inspected sources support them.

## Whole-article review

Before checking per-slide continuity, read all article blocks and slide explanations in order.

- Check the outline against the reader's main question and give each section or deck a distinct purpose.
  - Compare contributions across all decks, not only adjacent slides; a new chapter title does not make a repeated explanation useful.
- Order concepts from prerequisites to details and define unfamiliar terms at first use.
  - Do not make the reader learn a concept from a later slide to understand an earlier section.
- State the document subject once and remove repeated introductions, definitions, and conclusions that add no information.
- Put context before the relevant deck and end the article with an answer, important limits, and any required next action.
  - Do not end with a diagram-reading instruction instead of the article's conclusion.
- Keep assumptions and omitted failure paths visible when they change the meaning of the answer.

Static fixture checks can catch known outline regressions, not establish arbitrary narrative quality.

## Connected sequence

- Give each deck one main question and each slide a needed contribution to its answer.
- Use the first slide to establish the boundaries and reading path.
  - One slide is sufficient when it answers the question; do not add slides to meet a fixed count.
- Let each later slide expand a known component, explain a known decision, or continue a known process stage.
  - Retain enough familiar components or steps to make the connection visible.
  - Connect the prose naturally through that shared concept instead of repeating a template about the preceding slide, omitted context, and next slide.
  - Explain a focus change or omission only when the reader needs it to preserve meaning.
- Keep repeated node IDs, labels, and meanings consistent.
  - A focused slide need not retain all previous nodes or add new nodes if its explanation adds needed information.
- End with the result or relevant boundary of the deck's question without requiring a separate summary slide.

For each transition, identify the shared component, decision, or process stage.
For each slide, identify the information it adds to the article's answer.
Merge repeated views that add no needed explanation, including repeats in another deck.
Allow deliberate graph reuse when the new explanation has a clear purpose, such as applying a known boundary to a different failure condition.
Graph equality alone is neither a duplicate ban nor proof of useful reuse.
Move an independent question to another deck.
Shared nodes alone do not prove a useful connection.

For "How is a document saved?", system overview → API validation → storage write path is connected.
Validation expands the overview's API, and storage follows the validated request into persistence.
System overview → CSS theme comparison → storage write path is disconnected because the theme does not explain saving.

## Choose needed views

For architecture, an overview can show responsibilities while detail views expose validation and persistence boundaries.
A caller handoff can answer a separate question when it shows who receives a result and who acts on it.
For a process, an overview can establish success and recovery while a detail view exposes decision inputs and outcomes.
Do not add a start, end, or summary slide when it only repeats that overview.
Retain enough of the known boundary or stage to connect a focused view to the article.
Use formulas only to clarify a relationship and code only to explain an operation.

## Compact review record

Before saving, keep these short entries in working notes or the handoff, not as extra document fields:

- Claims: main claims and supporting source locations or supplied fact IDs, including arrow recipients, actions, order, and decision outcomes.
- Contributions: each deck/slide ID and its needed information, with the purpose of any reused graph.
- Issues: unsupported claims, omitted paths, and remaining checks, with corrections or an explicit unverified status.

Keep source review independent of render and size checks.
Finite fixture assertions catch known failures, not arbitrary diagram meaning or explanation quality.

## Compact diagrams and visual checks

- Use short node labels and move detailed qualifications to the explanation.
- Choose an orientation that fits the graph's shape at desktop and 390px.
  - Prefer a compact vertical path over a long horizontal chain when it keeps initial fitted labels readable.
  - Split unnecessary detail into focused slides rather than depending on Reset or Zoom to make the default view usable.
- For the bundled teaching examples, check a minimum default label size of 12 CSS px at both widths.
  - Measure every visible node, edge, and subgraph label in its initial fitted view before any camera action.
  - This is a testable target for these examples, not a promise for arbitrary graphs.
  - Minimum label sizes and successful rendering are prerequisites; they do not establish a good explanation, useful composition, or comfortable reading.
- Inspect the full rendered article and every slide at both widths for heading order, prose, emphasis, clipped content, labels, and failure caveats.
  - Successful parsing or a screenshot of only the initial slide is not a complete visual review.
  - Retain viewport and slide coverage with the browser evidence and report any missing coverage as unverified.
