# Article and diagram patterns

Plan the whole article before its slide sequences. Use a diagram when it clarifies the answer; a simple definition or one-step instruction normally needs only prose.
Flowchart subgraphs are visual groups, not interactive expansion.

## Source and meaning

Before drawing, identify the reader's main question, important execution or trust boundaries, and the fact each diagram must make visible.

- Trace every arrow to an inspected source location or an explicit supplied teaching fact.
  - Check sender, receiver, action or data, direction, and required order against that evidence.
  - Distinguish component relationships from process order; a dependency arrow does not establish which operation runs first.
  - Separate a returned value from the action its caller later performs; returning a URL to a caller is not a browser request.
- In a decision or process view, make each important decision's inputs, outcomes, and relevant side effects visible in the graph.
  - Use short input and branch labels, including rejection or no-write outcomes, rather than a full code expression in a node.
  - Show the handoff that enables the next operation and any ordering boundary that prevents an unsafe action.
  - If an architecture map shows only component relationships, explain decisions and order in prose rather than implying that the map shows a request trace.
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
- Keep repeated node or participant IDs, labels, and meanings consistent.
  - Keep the whole flowchart on focused slides. A different process-stage diagram may omit earlier steps if the connection is clear.
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

## Choose a diagram family

First identify what the reader needs to see. Use the user's requested family if it is supported. Otherwise, choose the simplest family that shows the answer directly. If a requested family is not supported, name a suitable supported alternative. Check the [document format](document-format.md#content-policy) for accepted headers and syntax limits.

| Reader's question                                                | Diagram family                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| What happens next, including branches and recovery?              | Flowchart (`flowchart`)                                                     |
| Who sends each message, and in what order?                       | Sequence (`sequenceDiagram`)                                                |
| Which states can this item enter, and what triggers each change? | State (`stateDiagram-v2`)                                                   |
| How do records relate, and how many can be linked?               | Entity relationship (`erDiagram`)                                           |
| How do software types relate?                                    | Class (`classDiagram`)                                                      |
| What are the system boundaries and levels of detail?             | C4 (`C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`) |
| What belongs where in a grid or a grouped layout?                | Block (`block`)                                                             |
| What happened, and when?                                         | Timeline (`timeline`)                                                       |
| When are tasks scheduled, and which tasks depend on others?      | Gantt (`gantt`)                                                             |
| How do tasks move across work columns?                           | Kanban (`kanban`)                                                           |
| What choices and experiences does a person have at each step?    | User journey (`journey`)                                                    |
| How did commits and branches diverge or merge?                   | Git graph (`gitGraph`)                                                      |
| What requirements exist, and what satisfies or verifies them?    | Requirement (`requirementDiagram`)                                          |
| Which bits belong to each field?                                 | Packet (`packet`)                                                           |
| How do values compare or change along an axis?                   | XY chart (`xychart`)                                                        |
| What fraction of one whole does each category represent?         | Pie (`pie`)                                                                 |
| How much of a quantity moves between each pair of groups?        | Sankey (`sankey`)                                                           |
| How do items compare on two independent criteria?                | Quadrant chart (`quadrantChart`)                                            |

- For charts and data diagrams, label units and categories, keep values and relationships faithful to their source, and do not invent missing numbers.
- For system architecture, use C4 when boundaries or levels of detail are the point; use a flowchart when decisions, branches, or recovery paths are the point.
- Leave `focusNodes` out unless zooming into one region of the same flowchart improves the explanation.
  - For a focused flowchart walkthrough, start with a complete overview and no attention frame. Focused detail slides keep identical complete Mermaid source and use `focusNodes` to zoom in on one region for a distinct contribution.
  - Select a small set of relevant nodes. Include neighbors only when their relationship matters. Use one frame per detail slide; do not reuse the same set of focus IDs, regardless of order. Regions can overlap when a node connects two distinct contributions.
  - Check what the frame implies; proximity alone does not imply shared ownership or execution order. Use subgraphs for supported boundaries, not to simulate attention frames.
  - Name the focused components in the explanation. Move details to prose when including them in the map would make the overview unreadable.
- Use a `sequenceDiagram` for an exchange where message order matters.
  - Name each participant. Place messages in required order from top to bottom, and check each arrow's direction. Distinguish a request from its response; a response does not show what its recipient does next.
  - State limits such as showing only a successful exchange. Explain retries, parallel work, or other omitted paths when they affect the answer.
  - Omit `focusNodes`. Participants and messages are not flowchart nodes. Use the complete [sequence example](../assets/sequence-walkthrough.json) for a request followed by a response.
- Mix families in one deck only when the slides build the same answer. A relationship map can establish roles, then a sequence slide can show one ordered exchange between those roles. Use a separate deck for an independent question.

Do not add a start, end, or summary slide when it only repeats the overview.
Retain enough of the known boundary or stage to connect a detail view to the article.
Use formulas only to clarify a relationship and code only to explain an operation.

## Compact review record

Before saving, keep these short entries in working notes or the handoff, not as extra document fields:

- Claims: main claims and supporting source locations or supplied fact IDs, including arrow recipients, actions, order, and decision outcomes.
- Contributions: each deck/slide ID and its needed information, with the purpose of any reused graph.
- Issues: unsupported claims, omitted paths, and remaining checks, with corrections or an explicit unverified status.

Keep source review independent of render and size checks.
Finite fixture assertions catch known failures, not arbitrary diagram meaning or explanation quality.

## Compact diagrams and visual checks

- Use short node, participant, and message labels. Move detailed qualifications to the explanation.
- Choose a layout that fits the diagram at desktop and 390px.
  - Prefer a compact vertical path over a long horizontal chain when it keeps initial fitted labels readable.
  - Keep the full architecture overview compact rather than depending on Reset or Zoom to make the default view usable.
- For the bundled teaching examples, check a minimum default label size of 12 CSS px at both widths.
  - Measure every visible node, edge, and subgraph label, or every participant and message label for a sequence diagram, in its initial fitted view before any camera action.
  - This is a testable target for these examples, not a promise for arbitrary graphs.
  - Minimum label sizes and successful rendering are prerequisites; they do not establish a good explanation, useful composition, or comfortable reading.
- Inspect the full rendered article and every slide at both widths for heading order, prose, emphasis, clipped content, labels, and failure caveats.
  - For focused flowchart decks, check that the overview has no frame, focused detail slides start on one region, and Fit to screen restores the whole diagram with the current frame.
  - Successful parsing or a screenshot of only the initial slide is not a complete visual review.
  - Retain viewport and slide coverage with the browser evidence and report any missing coverage as unverified.
