import mermaid from "mermaid"
import { expect, test } from "vitest"
import { assertMermaidPolicy, MERMAID_RENDERERS } from "../src/mermaid-policy.js"
import { mermaidTypeFixtures } from "./fixtures/mermaid-types.js"

const excludedRenderers = [
  "error",
  "---",
  "flowchart-elk",
  "mindmap",
  "architecture",
  "agentflow",
  "info",
  "swimlane",
  "eventmodeling",
  "treeView",
  "radar",
  "ishikawa",
  "treemap",
  "railroad",
  "railroadEbnf",
  "railroadAbnf",
  "railroadPeg",
  "venn",
  "wardley",
  "cynefin",
  "usecase",
]

mermaid.initialize({ startOnLoad: false })

test("classifies every pinned Mermaid renderer without enabling excluded entries", () => {
  const supported = [...new Set(Object.values(MERMAID_RENDERERS))]
  const classified = [...supported, ...excludedRenderers]
  expect(new Set(classified).size).toBe(classified.length)
  expect(
    mermaid
      .getRegisteredDiagramsMetadata()
      .map(({ id }) => id)
      .sort(),
  ).toEqual(classified.sort())
  expect(mermaidTypeFixtures.map(({ id }) => id).sort()).toEqual(
    Object.keys(MERMAID_RENDERERS).sort(),
  )
})

test.each(mermaidTypeFixtures)(
  "classifies $id consistently with Mermaid",
  ({ source, renderer }) => {
    const commented = ` \r\n%% Example\r\n${source}\r\n`
    expect(assertMermaidPolicy(commented)).toBe(renderer)
    expect(mermaid.detectType(commented)).toBe(renderer)
  },
)

test.each([
  "error",
  "---",
  "flowchart-elk",
  "mindmap",
  "architecture-beta",
  "agentflow-beta",
  "info",
  "swimlane-beta",
  "eventmodeling",
  "treeView-beta",
  "radar-beta",
  "ishikawa-beta",
  "ishikawa",
  "treemap-beta",
  "treemap",
  "railroad-beta",
  "railroad-ebnf-beta",
  "railroad-abnf-beta",
  "railroad-peg-beta",
  "venn-beta",
  "wardley-beta",
  "cynefin-beta",
  "usecase-beta",
  "zenuml",
  "xychart-beta",
  "packet-beta",
  "sankey-beta",
  "block-beta",
  "classDiagram-v2",
  "requirement",
  "graph-extra",
  "toString",
])("does not accept the excluded or unknown %s header", (header) => {
  expect(() => assertMermaidPolicy(`${header}\n  A`)).toThrow(/not (?:supported|permitted)/)
})
