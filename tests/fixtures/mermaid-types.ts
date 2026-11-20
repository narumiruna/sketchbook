import type { SketchbookDocument } from "../../src/document.js"

// One benign example for every supported header, including aliases. Renderer
// names are the registry IDs reported by Sketchbook's pinned Mermaid version.
export const mermaidTypeFixtures = [
  {
    id: "flowchart",
    renderer: "flowchart-v2",
    source: "flowchart LR\nA[Input] --> B[Output]",
    label: "Input",
  },
  {
    id: "graph",
    renderer: "flowchart-v2",
    source: "graph LR\nA[Start] --> B[Finish]",
    label: "Finish",
  },
  {
    id: "sequenceDiagram",
    renderer: "sequence",
    source: "sequenceDiagram\nClient->>Server: Request\nServer-->>Client: Response",
    label: "Response",
  },
  {
    id: "classDiagram",
    renderer: "classDiagram",
    source: "classDiagram\nAnimal <|-- Duck",
    label: "Duck",
  },
  {
    id: "stateDiagram-v2",
    renderer: "stateDiagram",
    source: "stateDiagram-v2\n[*] --> Ready",
    label: "Ready",
  },
  {
    id: "stateDiagram",
    renderer: "stateDiagram",
    source: "stateDiagram\n[*] --> Waiting",
    label: "Waiting",
  },
  {
    id: "erDiagram",
    renderer: "er",
    source: "erDiagram\nCUSTOMER ||--o{ ORDER : places",
    label: "CUSTOMER",
  },
  {
    id: "journey",
    renderer: "journey",
    source: "journey\n section Arrival\n  Enter: 5: Client",
    label: "Enter",
  },
  {
    id: "gantt",
    renderer: "gantt",
    source: "gantt\n dateFormat YYYY-MM-DD\n Draft :2026-11-21, 2d",
    label: "Draft",
  },
  { id: "pie", renderer: "pie", source: 'pie\n "Draft" : 10\n "Done" : 20', label: "Done" },
  {
    id: "gitGraph",
    renderer: "gitGraph",
    source: 'gitGraph\n commit id: "Origin"',
    label: "Origin",
  },
  {
    id: "requirementDiagram",
    renderer: "requirement",
    source:
      "requirementDiagram\n requirement delivery {\n id: 1\n text: Deliver\n risk: low\n verifymethod: test\n }",
    label: "delivery",
  },
  {
    id: "timeline",
    renderer: "timeline",
    source: "timeline\n 2026 : Launch",
    label: "Launch",
  },
  {
    id: "quadrantChart",
    renderer: "quadrantChart",
    source: "quadrantChart\n title Priorities\n Draft: [0.2, 0.8]",
    label: "Priorities",
  },
  {
    id: "kanban",
    renderer: "kanban",
    source: "kanban\n todo[To do]\n  task[Write]",
    label: "Write",
  },
  {
    id: "block",
    renderer: "block",
    source: 'block\n a["Start"] b["Finish"]\n a --> b',
    label: "Finish",
  },
  { id: "packet", renderer: "packet", source: 'packet\n0-7: "Header"', label: "Header" },
  { id: "sankey", renderer: "sankey", source: "sankey\n Input,Output,12", label: "Output" },
  {
    id: "xychart",
    renderer: "xychart",
    source: "xychart\n x-axis [Jan, Feb]\n bar [2, 4]",
    label: "Feb",
  },
  {
    id: "C4Context",
    renderer: "c4",
    source: 'C4Context\n Person(client, "Client")\n System(app, "App")\n Rel(client, app, "Uses")',
    label: "Uses",
  },
  {
    id: "C4Container",
    renderer: "c4",
    source: 'C4Container\n Person(reader, "Reader")',
    label: "Reader",
  },
  {
    id: "C4Component",
    renderer: "c4",
    source: 'C4Component\n Person(writer, "Writer")',
    label: "Writer",
  },
  {
    id: "C4Dynamic",
    renderer: "c4",
    source: 'C4Dynamic\n Person(editor, "Editor")',
    label: "Editor",
  },
  {
    id: "C4Deployment",
    renderer: "c4",
    source: 'C4Deployment\n Person(operator, "Operator")',
    label: "Operator",
  },
] as const

export function mermaidTypesDocument(): SketchbookDocument {
  const first = mermaidTypeFixtures.slice(0, 12)
  const second = mermaidTypeFixtures.slice(12)
  return {
    schemaVersion: 1,
    title: "Mermaid type round trip",
    blocks: [first, second].map((fixtures, index) => ({
      id: `deck-${index + 1}`,
      type: "diagram-deck",
      title: `Mermaid examples ${index + 1}`,
      slides: fixtures.map(({ id, source, label }) => ({
        id,
        title: id,
        // Exercise exact source preservation as well as acceptance.
        mermaid: `%% Fixture ${id}\r\n${source}\n`,
        explanationMarkdown: label,
      })),
    })),
  }
}
