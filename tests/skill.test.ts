import { readdir, readFile, realpath } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { describe, expect, test } from "vitest"
import { type DiagramDeck, type SketchbookDocument, validateDocument } from "../src/document.js"
import { MERMAID_RENDERERS } from "../src/mermaid-policy.js"

const skillRoot = fileURLToPath(new URL("../skills/sketchbook-explain-diagrams/", import.meta.url))
const skillFile = resolve(skillRoot, "SKILL.md")
const flowchartAssets = ["architecture-walkthrough.json", "process-walkthrough.json"] as const
const sequenceAsset = "sequence-walkthrough.json"
const assets = [...flowchartAssets, sequenceAsset] as const

async function loadFixture(name: (typeof assets)[number]) {
  return JSON.parse(await readFile(resolve(skillRoot, "assets", name), "utf8"))
}

type ReviewCase = {
  asset: (typeof flowchartAssets)[number]
  source: { kind: string; facts: Array<{ id: string; statement: string }> }
  review: {
    question: string
    claims: Array<{ claim: string; sources: string[] }>
    contributions: Array<{ deckId: string; slideId: string; adds: string; sources: string[] }>
    unresolved: string[]
  }
}

async function loadReviewCases(): Promise<{ scope: string; cases: ReviewCase[] }> {
  return JSON.parse(
    await readFile(new URL("./fixtures/generation-cases.json", import.meta.url), "utf8"),
  )
}

function localLinks(markdown: string) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1])
}

function isWithinSkill(path: string) {
  const local = relative(skillRoot, path)
  return local !== ".." && !local.startsWith("../") && !isAbsolute(local)
}

// These assertions describe the bundled fixtures, not arbitrary Mermaid or narrative quality.
function diagramNodes(source: string) {
  const nodes = source.replace(/^\s*subgraph[^\n]+/gm, "")
  return new Map(
    [...nodes.matchAll(/(\w+)(?:\[|\{)"([^"]+)"(?:\]|\})/g)].map((match) => [match[1], match[2]]),
  )
}

function deck(document: SketchbookDocument, id: string): DiagramDeck {
  const block = document.blocks.find((block) => block.id === id)
  if (block?.type !== "diagram-deck") throw new Error(`Missing teaching deck: ${id}`)
  return block
}

function expectArchitectureDetails(document: SketchbookDocument) {
  const save = deck(document, "architecture-deck")
  expect(save.slides.map((slide) => slide.id)).toEqual([
    "architecture-overview",
    "architecture-api",
    "architecture-storage",
    "architecture-commit",
  ])
  const [overview, api, storage, commit] = save.slides
  expect(overview.focusNodes).toBeUndefined()
  const focused = save.slides.slice(1).map((slide) => {
    expect(slide.mermaid).toBe(overview.mermaid)
    return [...(slide.focusNodes ?? [])].sort()
  })
  expect(focused).toEqual([["Api", "Client"], ["Store"], ["Files", "Store"]])
  expect(Object.fromEntries(diagramNodes(overview.mermaid))).toEqual({
    Client: "Client",
    Api: "API",
    Store: "Store",
    Files: "Files",
  })
  expect(overview.mermaid.split("\n").slice(1)).toEqual([
    '  Client["Client"] -->|calls| Api["API"]',
    '  subgraph Backend["Service 服務"]',
    '    Api -->|delegates| Store["Store"]',
    '    Store -->|writes| Files["Files"]',
    "  end",
  ])
  expect(storage.title).toBe("Serialized revision check")
  expect(overview.explanationMarkdown).toContain(
    "These arrows show component relationships, not execution order.",
  )
  expect(overview.explanationMarkdown).toContain(
    "The rejection boundaries are input validation in API and the revision check in Store.",
  )
  expect(api.explanationMarkdown).toContain(
    "API receives the complete document from Client and checks its schema and content policy.",
  )
  expect(api.explanationMarkdown).toContain("API sends only an accepted replacement to Store.")
  expect(api.explanationMarkdown).toContain(
    "API returns a validation error to Client: invalid input stops without a write and cannot reach Store.",
  )
  expect(storage.explanationMarkdown).toContain(
    "Store queues replacements so only one replacement can run at a time. Inside that operation, Store reads the current stored revision.",
  )
  expect(storage.explanationMarkdown).toContain(
    "Store compares the request's expected revision with the current revision.",
  )
  expect(storage.explanationMarkdown).toContain(
    "A mismatch rejects a stale replacement without creating temporary JSON, renaming a file, or incrementing the revision.",
  )
  expect(storage.explanationMarkdown).toContain(
    "Only after a match does Store write the complete replacement to temporary JSON.",
  )
  expect(storage.explanationMarkdown).toContain(
    "Another replacement cannot enter between the revision read, comparison, and rename; they remain one serialized Store operation.",
  )
  expect(commit.explanationMarkdown).toContain(
    "After the revision check matches, Store writes the accepted replacement to temporary JSON.",
  )
  expect(commit.explanationMarkdown).toContain(
    "Store then renames the temporary file over the stored file in Files within the same serialized Store operation.",
  )
  expect(commit.explanationMarkdown).toContain(
    "Writing the temporary file alone does not replace the stored file; the atomic rename is the commit boundary.",
  )
  expect(commit.explanationMarkdown).toContain(
    "A successful save increments the revision and confirms persistence, not rendering.",
  )
  expect(commit.explanationMarkdown).toContain(
    "For expected revision $r_e$ and stored revision $r_s$, a successful replacement obeys:",
  )
  expect(commit.explanationMarkdown).toContain("r_e = r_s,\\quad r_{next} = r_s + 1")

  const handoff = deck(document, "architecture-boundary")
  expect(handoff.slides.map((slide) => slide.id)).toEqual(["architecture-boundary-slide"])
  const [link] = handoff.slides
  expect(link.focusNodes).toBeUndefined()
  expect(Object.fromEntries(diagramNodes(link.mermaid))).toEqual({
    Client: "Client",
    Link: "Link API",
    Browser: "Browser",
    Viewer: "Viewer",
  })
  for (const edge of [
    'Client["Client"] -->|1 ask| Link["Link API"]',
    "Link -->|2 URL| Client",
    'Client -->|3 open URL| Browser["Browser"]',
    'Browser -->|4 GET| Viewer["Viewer"]',
  ]) {
    expect(link.mermaid).toContain(edge)
  }
  expect(link.explanationMarkdown).toContain("returns the URL to Client, not Browser")
  expect(link.explanationMarkdown).toContain("only Browser sends the page request to Viewer")
  expect(link.explanationMarkdown).toContain("not evidence that a browser opened")
}

function expectProcessStages(document: SketchbookDocument) {
  const replacement = deck(document, "process-deck")
  expect(replacement.slides.map((slide) => slide.id)).toEqual([
    "process-overview",
    "process-processing",
  ])
  const [overview, processing] = replacement.slides
  expect(overview.focusNodes).toBeUndefined()
  expect(processing.focusNodes).toBeUndefined()
  expect(processing.mermaid).not.toBe(overview.mermaid)
  expect(Object.fromEntries(diagramNodes(overview.mermaid))).toEqual({
    Read: "Read",
    Edit: "Edit",
    Write: "Write",
    Result: "Saved",
    Conflict: "No write",
  })
  expect(Object.fromEntries(diagramNodes(processing.mermaid))).toEqual({
    Expected: "Expected rev",
    Compare: "Match?",
    Current: "Stored rev",
    Commit: "Commit",
    Conflict: "No write",
  })
  expect(processing.title).toBe("Serialized write")
  expect(processing.mermaid).not.toContain("subgraph")
  for (const edge of [
    'Read["Read"] --> Edit["Edit"]',
    'Edit --> Write["Write"]',
    'Write -->|saved| Result["Saved"]',
    'Write -->|stale| Conflict["No write"]',
    "Conflict -->|refresh| Read",
  ]) {
    expect(overview.mermaid).toContain(edge)
  }
  for (const edge of [
    'Expected["Expected rev"] --> Compare{"Match?"}',
    'Current["Stored rev"] --> Compare',
    'Compare -->|Yes| Commit["Commit"]',
    'Compare -->|No| Conflict["No write"]',
  ]) {
    expect(processing.mermaid).toContain(edge)
  }
  expect(overview.explanationMarkdown).toContain("through both Read and Edit")
  expect(overview.explanationMarkdown).toContain("unrelated updates are retained")
  expect(overview.explanationMarkdown).toContain("not a blind retry")
  expect(processing.explanationMarkdown).toContain("Expected rev from Edit with Stored rev")
  expect(processing.explanationMarkdown).toContain(
    "Yes permits Commit, then Saved reports the new revision",
  )
  expect(processing.explanationMarkdown).toContain("No produces No write")
  expect(processing.explanationMarkdown).toContain(
    "no temporary file, rename, or revision increment",
  )
  expect(processing.explanationMarkdown).toContain(
    "cannot enter between this comparison and Commit",
  )
  expect(processing.explanationMarkdown).toContain("not merely replace the revision number")

  const note = document.blocks.find((block) => block.id === "process-note")
  if (note?.type !== "markdown") throw new Error("Missing recovery assumptions")
  expect(note.markdown).toContain("assume no competing writer during the check")
  expect(note.markdown).toContain("both stored content and revision")
  expect(note.markdown).toContain("If another writer can intervene")
  expect(note.markdown).toContain("stop and investigate")

  const recovery = deck(document, "process-response")
  expect(recovery.slides.map((slide) => slide.id)).toEqual(["process-response-slide"])
  const [response] = recovery.slides
  expect(Object.fromEntries(diagramNodes(response.mermaid))).toEqual({
    Read: "Read",
    Found: "Saved?",
    Planned: "Planned update",
    Stop: "No retry",
    Edit: "Edit",
  })
  for (const edge of [
    'Read["Read"] -->|stored state| Found{"Saved?"}',
    'Planned["Planned update"] --> Found',
    'Found -->|Yes| Stop["No retry"]',
    'Found -->|No| Edit["Edit"]',
  ]) {
    expect(response.mermaid).toContain(edge)
  }
  expect(response.explanationMarkdown).toContain("stored content and revision")
  expect(response.explanationMarkdown).toContain("No retry avoids a second write")
  expect(response.explanationMarkdown).toContain("current content and revision")
  expect(response.explanationMarkdown).toContain(
    "does not verify Mermaid, math, readability, or content correctness",
  )
}

function expectTeachingClaims(
  document: SketchbookDocument,
  name: (typeof flowchartAssets)[number],
) {
  if (name === "architecture-walkthrough.json") expectArchitectureDetails(document)
  else expectProcessStages(document)
}

const articleOutlines = {
  "architecture-walkthrough.json": {
    blocks: [
      "architecture-intro",
      "architecture-deck",
      "architecture-context",
      "architecture-boundary",
      "architecture-conclusion",
    ],
    headings: [
      "Scope and terms",
      "Save boundaries",
      "Opening a saved document",
      "Viewer handoff",
      "Conclusion",
    ],
    definitions: [
      "教學模型",
      "Document API",
      "Document Store",
      "revision is the stored version number",
    ],
    conclusion: [
      "Validation",
      "revision checks",
      "atomic replacement",
      "not rendering",
      "implementation",
    ],
  },
  "process-walkthrough.json": {
    blocks: [
      "process-intro",
      "process-deck",
      "process-note",
      "process-response",
      "process-conclusion",
    ],
    headings: [
      "Inputs and revision",
      "Replacement path",
      "An uncertain response",
      "Interrupted response",
      "Conclusion",
    ],
    definitions: [
      "teaching model",
      "revision, a version number",
      "complete replacement",
      "expectedRevision",
      "valid input",
    ],
    conclusion: [
      "validation",
      "matching revision",
      "commit",
      "conflict",
      "unverified",
      "human acceptance",
    ],
  },
  [sequenceAsset]: {
    blocks: ["sequence-intro", "sequence-order", "sequence-conclusion"],
    headings: ["Participants and scope", "Message order", "Conclusion"],
    definitions: ["teaching model", "Client is the caller", "participant is a sender or receiver"],
    conclusion: ["returns to the original caller", "does not show retries, failure"],
  },
} as const

function fixtureMarkdown(document: SketchbookDocument) {
  return document.blocks.flatMap((block) => {
    if (block.type === "markdown") return [block.markdown]
    if (block.type === "diagram-deck") return block.slides.map((slide) => slide.explanationMarkdown)
    return []
  })
}

// A known article outline and its prerequisite terms are regression checks, not a prose evaluator.
function expectArticleOutline(document: SketchbookDocument, name: (typeof assets)[number]) {
  const expected = articleOutlines[name]
  expect(document.blocks.map((block) => block.id)).toEqual(expected.blocks)
  const headings = document.blocks.flatMap((block) => {
    if (block.type === "diagram-deck") {
      for (const slide of block.slides) {
        expect(slide.explanationMarkdown).not.toMatch(/^#{1,3}\s/m)
      }
      return [block.title]
    }
    if (block.type !== "markdown") return []
    expect(block.markdown).not.toMatch(/^#\s/m)
    return [...block.markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1])
  })
  expect(headings).toEqual(expected.headings)
  expect(headings).not.toContain(document.title)
  const intro = document.blocks[0]
  const conclusion = document.blocks.at(-1)
  expect(intro.type).toBe("markdown")
  expect(conclusion?.type).toBe("markdown")
  if (intro.type !== "markdown" || conclusion?.type !== "markdown") return
  for (const term of expected.definitions) expect(intro.markdown).toContain(term)
  for (const term of expected.conclusion) expect(conclusion.markdown).toContain(term)
  for (const markdown of fixtureMarkdown(document)) {
    expect(markdown).not.toMatch(/preceding slide|next slide|omitted here|rendering fixtures?/i)
  }
}

function expectParsedEmphasis(markdown: string) {
  const html = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown),
  )
  expect(html).not.toContain("**")
  return html
}

function expectCompactLabels(document: SketchbookDocument) {
  const labels = new Map<string, string>()
  for (const block of document.blocks) {
    if (block.type !== "diagram-deck") continue
    for (const slide of block.slides) {
      for (const [id, label] of diagramNodes(slide.mermaid)) {
        if (labels.has(id)) expect(label).toBe(labels.get(id))
        labels.set(id, label)
      }
      // A fixture-specific label budget cannot measure rendered CSS pixels.
      for (const [, label] of slide.mermaid.matchAll(/"([^"]+)"/g)) {
        expect([...label].length).toBeLessThanOrEqual(16)
      }
      if (diagramNodes(slide.mermaid).size > 2) {
        expect(slide.mermaid).toMatch(/^flowchart TD\b/)
      }
    }
  }
}

describe("bundled Sketchbook skill", () => {
  test("has portable, concise routing frontmatter", async () => {
    const skill = await readFile(skillFile, "utf8")
    const frontmatter = skill.match(/^---\n([\s\S]+?)\n---\n/)
    expect(frontmatter).not.toBeNull()
    const fields = Object.fromEntries(
      (frontmatter?.[1] ?? "")
        .trim()
        .split("\n")
        .map((line) => {
          const field = line.match(/^([a-z-]+): (.+)$/)
          expect(field, `Simple YAML scalar expected: ${line}`).not.toBeNull()
          return [field?.[1], field?.[2]]
        }),
    )
    expect(Object.keys(fields).sort()).toEqual(["description", "name"])
    expect(fields.name).toBe("sketchbook-explain-diagrams")
    expect(fields.name).toBe(relative(dirname(skillRoot), skillRoot))
    expect(fields.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(fields.name.length).toBeLessThanOrEqual(64)
    expect(fields.description.trim().length).toBeGreaterThan(0)
    expect(fields.description.length).toBeLessThanOrEqual(1024)
    expect(fields.description).toMatch(/architecture/i)
    expect(fields.description).toMatch(/process/i)
    expect(fields.description).toMatch(/message order/i)
    expect(fields.description).toMatch(/when/i)
    expect(skill.split("\n").length).toBeLessThan(100)
  })

  test("suggests diagrams for useful interactions without saving or opening a simple answer", async () => {
    const skill = await readFile(skillFile, "utf8")
    expect(skill).toContain("Suggest a diagram when it makes an interaction")
    expect(skill).toContain("For a simple answer, reply directly without creating or opening")
    expect(skill).toContain("Use `sketchbook_write` only for an agreed saved document")
    expect(skill).toContain("Use `sketchbook_open` only when a viewer link is wanted")
    expect(skill).toContain("Omit `focusNodes` on all non-flowchart slides")
  })

  test("publishes the same Mermaid family matrix in the README and skill format", async () => {
    const documents = await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(resolve(skillRoot, "references/document-format.md"), "utf8"),
    ])
    const matrices = documents.map((markdown) => {
      const table = /^\|\s*Family\s*\|\s*Accepted headers\s*\|\s*\n[^\n]+\n((?:\|[^\n]+\n)+)/m.exec(
        markdown,
      )
      expect(table).not.toBeNull()
      const rows = table?.[1].trimEnd().split("\n") ?? []
      expect(rows).toHaveLength(18)
      const headers = rows.flatMap((row) =>
        [...row.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
      )
      expect(headers.sort()).toEqual(Object.keys(MERMAID_RENDERERS).sort())
      return rows.map((row) => row.split("|").map((cell) => cell.trim()))
    })
    expect(matrices[0]).toEqual(matrices[1])
  })

  test("requires whole-article review before slide continuity and saving", async () => {
    const skill = await readFile(skillFile, "utf8")
    const patterns = await readFile(resolve(skillRoot, "references/diagram-patterns.md"), "utf8")
    const articleReview = skill.indexOf("review the whole article's outline")
    const slideReview = skill.indexOf("before checking each slide's contribution and continuity")
    const save = skill.indexOf("5. Use `sketchbook_write`")
    expect(articleReview).toBeGreaterThan(0)
    expect(slideReview).toBeGreaterThan(articleReview)
    expect(save).toBeGreaterThan(slideReview)
    for (const check of ["concept order", "first definitions", "repetition", "conclusion"]) {
      expect(skill).toContain(check)
    }
    expect(patterns).toContain("read all article blocks and slide explanations in order")
    expect(patterns).toContain("define unfamiliar terms at first use")
    expect(patterns).toContain("State the document subject once")
    expect(patterns).toContain("end the article with an answer, important limits")
    expect(patterns).toContain("not establish arbitrary narrative quality")
    expect(patterns).toContain("instead of repeating a template")
  })

  test("requires source-checked arrows, visible decisions, cross-deck contributions, and a review record", async () => {
    const skill = await readFile(skillFile, "utf8")
    const patterns = await readFile(resolve(skillRoot, "references/diagram-patterns.md"), "utf8")
    expect(skill).toContain("important execution or trust boundaries")
    expect(skill).toContain("each diagram's visible claim")
    expect(skill).toContain("source, decision, and cross-deck contribution checks")
    expect(skill).toContain("compact review record before calling `sketchbook_write`")
    for (const requirement of [
      "sender, receiver, action or data, direction, and required order",
      "component relationships from process order",
      "returning a URL to a caller is not a browser request",
      "decision's inputs, outcomes, and relevant side effects visible in the graph",
      "rejection or no-write outcomes",
      "rather than a full code expression in a node",
      "Compare contributions across all decks",
      "Merge repeated views that add no needed explanation",
      "Allow deliberate graph reuse when the new explanation has a clear purpose",
      "Graph equality alone is neither a duplicate ban nor proof of useful reuse",
      "Claims: main claims and supporting source locations or supplied fact IDs",
      "Contributions: each deck/slide ID and its needed information",
      "Issues: unsupported claims, omitted paths, and remaining checks",
      "not as extra document fields",
      "not arbitrary diagram meaning or explanation quality",
    ]) {
      expect(patterns).toContain(requirement)
    }
  })

  test("documents viewer headings and separate evidence states", async () => {
    const format = await readFile(resolve(skillRoot, "references/document-format.md"), "utf8")
    expect(format).toContain("`document.title` owns the page H1")
    expect(format).toContain("Start article Markdown headings at H2")
    expect(format).toContain("`deck.title` becomes a stable H2")
    expect(format).toContain("active slide title becomes H3")
    expect(format).toContain("start at H4 so they cannot compete")
    expect(format).toContain("`**資料範圍**：依` rather than `**資料範圍：**依`")
    for (const state of ["Saved", "Rendered", "Readable", "Content-correct", "Human acceptance"]) {
      expect(format).toContain(`- **${state}**:`)
    }
    expect(format).toContain("agent checks do not establish this state")
    expect(format).toContain("mark missing evidence as unverified")
    expect(format).toContain("Do not infer one state from another")
    expect(format).toContain("compact review record defined in the diagram patterns")
    expect(format).toContain("arrow recipients, actions, order, decision inputs and outcomes")
  })

  test("requires complete desktop and mobile visual coverage at the initial fitted size", async () => {
    const skill = await readFile(skillFile, "utf8")
    const patterns = await readFile(resolve(skillRoot, "references/diagram-patterns.md"), "utf8")
    expect(skill).toContain(
      "inspect the full rendered article and every slide at desktop and 390px",
    )
    expect(skill).toContain(
      "explicitly report which viewport, article, or slide coverage remains unverified",
    )
    expect(patterns).toContain("minimum default label size of 12 CSS px at both widths")
    expect(patterns).toContain("every visible node, edge, and subgraph label")
    expect(patterns).toContain("initial fitted view before any camera action")
    expect(patterns).toContain("not a promise for arbitrary graphs")
    expect(patterns).toContain("Minimum label sizes and successful rendering are prerequisites")
    expect(patterns).toContain("do not establish a good explanation")
    expect(patterns).toContain("rather than depending on Reset or Zoom")
    expect(patterns).toContain("only the initial slide is not a complete visual review")
  })

  test("directly links every resource and keeps local links inside the skill", async () => {
    const resources = (await readdir(skillRoot, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => resolve(entry.parentPath, entry.name))
      .filter((path) => path !== skillFile)
    const skill = await readFile(skillFile, "utf8")
    const directTargets = localLinks(skill).map((link) => resolve(skillRoot, link))
    expect(directTargets.sort()).toEqual(resources.sort())
    expect(resources).toHaveLength(5)

    for (const file of [skillFile, ...resources.filter((path) => path.endsWith(".md"))]) {
      for (const link of localLinks(await readFile(file, "utf8"))) {
        expect(link, "Bundled links must be relative local paths").not.toMatch(/^(?:[a-z]+:|\/)/i)
        const target = resolve(dirname(file), link.split("#")[0])
        expect(isWithinSkill(target), `${file}: ${link}`).toBe(true)
        expect(isWithinSkill(await realpath(target)), `${file}: ${link}`).toBe(true)
      }
    }
  })

  for (const name of flowchartAssets) {
    test(`${name} satisfies the strict schema and contains mixed-format content`, async () => {
      const fixture = await loadFixture(name)
      expect(() => validateDocument(fixture)).not.toThrow()
      expect(Buffer.byteLength(JSON.stringify(fixture), "utf8")).toBeLessThanOrEqual(1024 * 1024)
      const prose = fixtureMarkdown(fixture).join("\n")
      expect(prose).toMatch(/\S/)
      expect(prose).toMatch(/(?<!\$)\$[^$\n]+\$(?!\$)/)
      expect(prose).toMatch(/\n\$\$\n[\s\S]+?\n\$\$/)
      expect(prose).toMatch(/```typescript\n[\s\S]+?\n```/)
      const decks = fixture.blocks.filter(
        (block: { type: string }) => block.type === "diagram-deck",
      )
      expect(decks.length).toBeGreaterThanOrEqual(2)
      expect(decks.some((deck: { slides: unknown[] }) => deck.slides.length === 1)).toBe(true)
      for (const deck of decks) {
        for (const slide of deck.slides) {
          expect(slide.mermaid).toMatch(/^flowchart\s+(?:LR|RL|TD|TB|BT)\b/)
          expect(slide.explanationMarkdown.trim()).not.toBe("")
        }
      }
    })
  }

  test.each(flowchartAssets)(
    "%s has the reviewed article outline and compact teaching labels",
    async (name) => {
      const document = validateDocument(await loadFixture(name))
      expectArticleOutline(document, name)
      expectCompactLabels(document)
      for (const markdown of fixtureMarkdown(document)) expectParsedEmphasis(markdown)
    },
  )

  test("sequence walkthrough teaches ordered messages without flowchart focus", async () => {
    const document = validateDocument(await loadFixture(sequenceAsset))
    expectArticleOutline(document, sequenceAsset)
    for (const markdown of fixtureMarkdown(document)) expectParsedEmphasis(markdown)
    const sequence = deck(document, "sequence-order")
    expect(sequence.slides.map((slide) => slide.id)).toEqual(["sequence-request"])
    const [slide] = sequence.slides
    expect(slide.focusNodes).toBeUndefined()
    expect(slide.mermaid.split("\n").map((line) => line.trim())).toEqual([
      "sequenceDiagram",
      "participant Client",
      "participant Service",
      "Client->>Service: Request",
      "Service-->>Client: Response",
    ])
    expect(slide.explanationMarkdown).toContain("Read the messages from top to bottom")
    expect(slide.explanationMarkdown).toContain("First, Client sends Request to Service")
    expect(slide.explanationMarkdown).toContain(
      "After handling it, Service sends Response back to Client",
    )
    sequence.slides.push({ ...slide, id: "sequence-focus", focusNodes: ["Client"] })
    expect(() => validateDocument(document)).toThrow(
      /focus nodes are only supported for flowchart/i,
    )
  })

  test("the CJK emphasis example renders without raw delimiters", async () => {
    const document = validateDocument(await loadFixture("architecture-walkthrough.json"))
    const markdown = fixtureMarkdown(document)[0]
    expect(expectParsedEmphasis(markdown)).toContain("<strong>資料範圍</strong>：此")
    const broken = markdown.replace("**資料範圍**：此", "**資料範圍：**此")
    expect(broken).not.toBe(markdown)
    expect(() => expectParsedEmphasis(broken)).toThrow()
  })

  test.each(assets)("known outline checks catch authoring failures in %s", async (name) => {
    const original = validateDocument(await loadFixture(name))
    const mutate = (change: (document: SketchbookDocument) => void) => {
      const document = structuredClone(original)
      change(document)
      expect(() => validateDocument(document)).not.toThrow()
      expect(() => expectArticleOutline(document, name)).toThrow()
    }
    mutate((document) => {
      const intro = document.blocks[0]
      if (intro.type === "markdown") intro.markdown = `# ${document.title}\n\n${intro.markdown}`
    })
    mutate((document) => {
      const intro = document.blocks[0]
      if (intro.type === "markdown") {
        intro.markdown = intro.markdown.replace(
          articleOutlines[name].definitions[0],
          "undefined term",
        )
      }
    })
    mutate((document) => {
      const intro = document.blocks[0]
      document.blocks[0] = document.blocks[1]
      document.blocks[1] = intro
    })
    mutate((document) => {
      const deck = document.blocks[1]
      if (deck.type === "diagram-deck") {
        deck.slides[0].explanationMarkdown = `## Competing chapter\n\n${deck.slides[0].explanationMarkdown}`
      }
    })
    mutate((document) => {
      const intro = document.blocks[0]
      if (intro.type === "markdown") {
        intro.markdown = intro.markdown.replace(/^## .+/, `## ${document.title}`)
      }
    })
    mutate((document) => {
      document.blocks.pop()
    })
    mutate((document) => {
      const conclusion = document.blocks.at(-1)
      if (conclusion?.type === "markdown") {
        conclusion.markdown = "## Conclusion\n\nUse the arrows to read the diagrams."
      }
    })
  })

  test.each(flowchartAssets)(
    "label checks catch long labels and horizontal chains in %s",
    async (name) => {
      const document = validateDocument(await loadFixture(name))
      const deck = document.blocks.find(
        (block): block is DiagramDeck => block.type === "diagram-deck",
      )
      if (!deck) throw new Error("Missing teaching deck")
      const source = deck.slides[0].mermaid
      const update = (mermaid: string) => {
        deck.slides[0].mermaid = mermaid
        for (const slide of deck.slides) {
          if (slide.focusNodes) slide.mermaid = mermaid
        }
      }
      update(source.replace(/"[^"]+"/, '"A long prose explanation that belongs in Markdown"'))
      expect(() => validateDocument(document)).not.toThrow()
      expect(() => expectCompactLabels(document)).toThrow()
      update(source.replace("flowchart TD", "flowchart LR"))
      expect(() => validateDocument(document)).not.toThrow()
      expect(() => expectCompactLabels(document)).toThrow()
    },
  )

  test("teaching facts and compact review records cover every slide across both decks", async () => {
    const cases = await loadReviewCases()
    expect(cases.scope).toContain("not a universal semantic linter")
    expect(cases.cases.map((item) => item.asset)).toEqual(flowchartAssets)
    for (const item of cases.cases) {
      const document = validateDocument(await loadFixture(item.asset))
      expect(item.source.kind).toBe("supplied teaching facts")
      const factIds = item.source.facts.map((fact) => fact.id)
      expect(new Set(factIds).size).toBe(factIds.length)
      for (const fact of item.source.facts) expect(fact.statement.trim()).not.toBe("")
      expect(item.review.question.trim()).not.toBe("")
      expect(item.review.claims.length).toBeGreaterThan(0)
      expect(item.review.unresolved.length).toBeGreaterThan(0)
      for (const claim of item.review.claims) expect(claim.claim.trim()).not.toBe("")
      for (const issue of item.review.unresolved) expect(issue.trim()).not.toBe("")
      for (const entry of [...item.review.claims, ...item.review.contributions]) {
        expect(entry.sources.length).toBeGreaterThan(0)
        for (const source of entry.sources) expect(factIds).toContain(source)
      }
      const slides = document.blocks.flatMap((block) =>
        block.type === "diagram-deck" ? block.slides.map((slide) => `${block.id}/${slide.id}`) : [],
      )
      expect(item.review.contributions.map((entry) => `${entry.deckId}/${entry.slideId}`)).toEqual(
        slides,
      )
      for (const contribution of item.review.contributions) {
        expect(contribution.adds.trim()).not.toBe("")
      }
      // Record completeness is not evidence that arbitrary claims are true.
      expectTeachingClaims(document, item.asset)
    }
  })

  test.each(flowchartAssets)("%s has its reviewed source-supported contributions", async (name) => {
    expectTeachingClaims(validateDocument(await loadFixture(name)), name)
  })

  test.each([
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-boundary",
      index: 0,
      failure: "wrong URL recipient",
      from: "Link -->|2 URL| Client",
      to: "Link -->|2 URL| Browser",
    },
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-boundary",
      index: 0,
      failure: "returned link treated as a page request",
      from: 'Browser -->|4 GET| Viewer["Viewer"]',
      to: 'Link -->|4 GET| Viewer["Viewer"]',
    },
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-deck",
      index: 0,
      failure: "reversed service delegation",
      from: 'Api -->|delegates| Store["Store"]',
      to: 'Store["Store"] -->|delegates| Api',
    },
    {
      asset: "process-walkthrough.json",
      deckId: "process-deck",
      index: 0,
      failure: "blind retry bypassing Read and Edit",
      from: "Conflict -->|refresh| Read",
      to: "Conflict -->|refresh| Write",
    },
    {
      asset: "process-walkthrough.json",
      deckId: "process-deck",
      index: 1,
      failure: "lost stored revision input",
      from: '  Current["Stored rev"] --> Compare\n',
      to: "",
    },
    {
      asset: "process-walkthrough.json",
      deckId: "process-deck",
      index: 1,
      failure: "lost mismatch outcome",
      from: '  Compare -->|No| Conflict["No write"]',
      to: "",
    },
    {
      asset: "process-walkthrough.json",
      deckId: "process-deck",
      index: 1,
      failure: "lost expected revision input",
      from: '  Expected["Expected rev"] --> Compare{"Match?"}\n',
      to: "",
    },
    {
      asset: "process-walkthrough.json",
      deckId: "process-response",
      index: 0,
      failure: "lost no-retry outcome",
      from: '  Found -->|Yes| Stop["No retry"]\n',
      to: "",
    },
  ] as const)("finite case check catches $failure", async ({ asset, deckId, index, from, to }) => {
    const document = validateDocument(await loadFixture(asset))
    const slide = deck(document, deckId).slides[index]
    expect(slide.mermaid).toContain(from)
    const updated = slide.mermaid.replace(from, to)
    if (deckId === "architecture-deck") {
      for (const view of deck(document, deckId).slides) view.mermaid = updated
    } else {
      slide.mermaid = updated
    }
    // All mutations remain schema-valid; only these reviewed case claims reject them.
    expect(() => validateDocument(document)).not.toThrow()
    expect(() => expectTeachingClaims(document, asset)).toThrow()
  })

  test.each([
    { asset: "architecture-walkthrough.json", deckId: "architecture-deck", index: 1 },
    { asset: "architecture-walkthrough.json", deckId: "architecture-deck", index: 2 },
    { asset: "architecture-walkthrough.json", deckId: "architecture-deck", index: 3 },
    { asset: "architecture-walkthrough.json", deckId: "architecture-boundary", index: 0 },
    { asset: "process-walkthrough.json", deckId: "process-deck", index: 1 },
    { asset: "process-walkthrough.json", deckId: "process-response", index: 0 },
  ] as const)(
    "finite contribution check catches redundant detail in $asset $deckId/$index",
    async ({ asset, deckId, index }) => {
      const document = validateDocument(await loadFixture(asset))
      const first = document.blocks.find(
        (block): block is DiagramDeck => block.type === "diagram-deck",
      )
      if (!first) throw new Error("Missing overview")
      const detail = deck(document, deckId).slides[index]
      const originalExplanation = detail.explanationMarkdown
      // Reusing the full graph does not make a copied overview explanation useful.
      detail.explanationMarkdown = first.slides[0].explanationMarkdown
      expect(() => validateDocument(document)).not.toThrow()
      expect(() => expectTeachingClaims(document, asset)).toThrow()
      if (!detail.focusNodes) {
        detail.explanationMarkdown = originalExplanation
        detail.mermaid = first.slides[0].mermaid
        expect(() => validateDocument(document)).not.toThrow()
        expect(() => expectTeachingClaims(document, asset)).toThrow()
      }
    },
  )

  test.each([
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-deck",
      index: 2,
      caveat: "Only after a match",
    },
    {
      asset: "process-walkthrough.json",
      deckId: "process-deck",
      index: 0,
      caveat: "not a blind retry",
    },
    {
      asset: "process-walkthrough.json",
      deckId: "process-deck",
      index: 1,
      caveat: "no temporary file, rename, or revision increment",
    },
  ] as const)(
    "finite case check catches lost $caveat in $asset",
    async ({ asset, deckId, index, caveat }) => {
      const document = validateDocument(await loadFixture(asset))
      const slide = deck(document, deckId).slides[index]
      expect(slide.explanationMarkdown).toContain(caveat)
      slide.explanationMarkdown = slide.explanationMarkdown.replace(caveat, "without safeguards")
      expect(() => validateDocument(document)).not.toThrow()
      expect(() => expectTeachingClaims(document, asset)).toThrow()
    },
  )

  test.each([
    [1, "only an accepted replacement to Store", "only an accepted replacement to Client"],
    [1, "invalid input stops without a write", "invalid input reaches storage"],
    [2, "without creating temporary JSON", "after renaming the stored file"],
    [2, "the request's expected revision", "a constant"],
    [2, "with the current revision", "with a constant"],
    [2, "Inside that operation", "Before entering the queue"],
    [3, "Store then renames", "Store renames before writing"],
  ] as const)(
    "review catches altered architecture prose on slide %i: %s",
    async (index, from, to) => {
      const document = validateDocument(await loadFixture("architecture-walkthrough.json"))
      const slide = deck(document, "architecture-deck").slides[index]
      expect(slide.explanationMarkdown).toContain(from)
      slide.explanationMarkdown = slide.explanationMarkdown.replace(from, to)
      expect(() => validateDocument(document)).not.toThrow()
      expect(() => expectArchitectureDetails(document)).toThrow()
    },
  )

  test.each(
    [["Api", "Client"], ["Unknown"], ["Client", "Files"]].map((focusNodes) => ({ focusNodes })),
  )("review catches an incorrect or reused focus: $focusNodes", async ({ focusNodes }) => {
    const document = validateDocument(await loadFixture("architecture-walkthrough.json"))
    deck(document, "architecture-deck").slides[2].focusNodes = focusNodes
    expect(() => validateDocument(document)).not.toThrow()
    expect(() => expectArchitectureDetails(document)).toThrow()
  })

  test("finite case check catches a saved response before commit", async () => {
    const document = validateDocument(await loadFixture("process-walkthrough.json"))
    const processing = deck(document, "process-deck").slides[1]
    processing.explanationMarkdown = processing.explanationMarkdown.replace(
      "Yes permits Commit, then Saved reports the new revision",
      "Saved reports the new revision before Commit",
    )
    expect(() => validateDocument(document)).not.toThrow()
    expect(() => expectProcessStages(document)).toThrow()
  })

  test("interrupted-response recovery retains its no-competing-writer assumption", async () => {
    const document = validateDocument(await loadFixture("process-walkthrough.json"))
    const note = document.blocks.find((block) => block.id === "process-note")
    if (note?.type !== "markdown") throw new Error("Missing recovery assumptions")
    note.markdown = note.markdown.replace(
      "assume no competing writer during the check",
      "always retry",
    )
    expect(() => validateDocument(document)).not.toThrow()
    expect(() => expectProcessStages(document)).toThrow()
  })

  test.each([
    "mindmap\n root((Topic))",
    "flowchart-elk LR\n A --> B",
    "---\ntitle: Override\n---\nflowchart LR\n A --> B",
    '%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\n A --> B',
    'flowchart LR\n A --> B\n click A "https://example.com"',
    'flowchart LR\n A["<b>HTML label</b>"]',
    'flowchart LR\n A@{ img: "https://example.com/image.png" }',
    'flowchart LR\n A@{ icon: "fa:home" }',
  ])("rejects unsupported or unsafe Mermaid source: %s", async (mermaid) => {
    const fixture = validateDocument(await loadFixture("architecture-walkthrough.json"))
    deck(fixture, "architecture-boundary").slides[0].mermaid = mermaid
    expect(() => validateDocument(fixture)).toThrow()
  })

  test("rejects an extra field and duplicate fixture IDs", async () => {
    const extra = await loadFixture("architecture-walkthrough.json")
    extra.unexpected = true
    expect(() => validateDocument(extra)).toThrow()

    const duplicateBlock = await loadFixture("architecture-walkthrough.json")
    duplicateBlock.blocks[1].id = duplicateBlock.blocks[0].id
    expect(() => validateDocument(duplicateBlock)).toThrow()

    const duplicateSlide = await loadFixture("process-walkthrough.json")
    const deck = duplicateSlide.blocks.find(
      (block: { type: string }) => block.type === "diagram-deck",
    )
    deck.slides[1].id = deck.slides[0].id
    expect(() => validateDocument(duplicateSlide)).toThrow()
  })
})
