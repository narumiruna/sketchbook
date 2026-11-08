import { readdir, readFile, realpath } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { describe, expect, test } from "vitest"
import { type DiagramDeck, type SketchbookDocument, validateDocument } from "../src/document.js"

const skillRoot = fileURLToPath(new URL("../skills/sketchbook-explain-diagrams/", import.meta.url))
const skillFile = resolve(skillRoot, "SKILL.md")
const assets = ["architecture-walkthrough.json", "process-walkthrough.json"] as const

async function loadFixture(name: (typeof assets)[number]) {
  return JSON.parse(await readFile(resolve(skillRoot, "assets", name), "utf8"))
}

type ReviewCase = {
  asset: (typeof assets)[number]
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
  const labels = new Map([
    ["Client", "Client"],
    ["Api", "API"],
    ["Store", "Store"],
    ["Valid", "Valid?"],
    ["Invalid", "No write"],
    ["Queue", "Queue"],
    ["Current", "Read rev"],
    ["Compare", "Match?"],
    ["Conflict", "No write"],
    ["Temp", "Temp JSON"],
    ["Commit", "Rename"],
    ["Files", "Files"],
  ])
  const stages = [
    { slide: overview, nodes: ["Client", "Api", "Store"], grouped: true },
    { slide: api, nodes: ["Api", "Valid", "Invalid", "Store"], grouped: true },
    {
      slide: storage,
      nodes: ["Queue", "Current", "Compare", "Conflict", "Temp"],
      grouped: false,
    },
    { slide: commit, nodes: ["Temp", "Commit", "Files"], grouped: false },
  ]
  for (const { slide, nodes, grouped } of stages) {
    const actual = diagramNodes(slide.mermaid)
    expect([...actual.keys()].sort()).toEqual([...nodes].sort())
    for (const [id, label] of actual) expect(label).toBe(labels.get(id))
    expect(slide.mermaid.includes("subgraph")).toBe(grouped)
  }
  expect(overview.mermaid).toContain('Client["Client"] -->|calls| Api["API"]')
  expect(overview.mermaid).toContain('Api -->|delegates| Store["Store"]')
  expect(overview.explanationMarkdown).toContain("component relationships, not execution order")
  for (const edge of [
    'subgraph ApiDetail["API checks"]',
    'Api["API"] --> Valid{"Valid?"}',
    '  end\n  Valid -->|Yes| Store["Store"]',
    'Valid -->|No| Invalid["No write"]',
  ]) {
    expect(api.mermaid).toContain(edge)
  }
  for (const edge of [
    'Queue["Queue"] --> Current["Read rev"]',
    'Queue -->|expected rev| Compare{"Match?"}',
    "Current -->|current rev| Compare",
    'Compare -->|Yes| Temp["Temp JSON"]',
    'Compare -->|No| Conflict["No write"]',
  ]) {
    expect(storage.mermaid).toContain(edge)
  }
  for (const edge of ['Temp["Temp JSON"] --> Commit["Rename"]', 'Commit --> Files["Files"]']) {
    expect(commit.mermaid).toContain(edge)
  }
  expect(api.explanationMarkdown).toContain("complete document from Client")
  expect(api.explanationMarkdown).toContain("schema and content policy")
  expect(api.explanationMarkdown).toContain("accepted replacement through Handler to Store")
  expect(api.explanationMarkdown).toContain("invalid input stops without a write")
  expect(api.explanationMarkdown).toContain("cannot reach Store")
  expect(storage.explanationMarkdown).toContain("then Read rev reads the stored revision")
  expect(storage.explanationMarkdown).toContain("inside that operation")
  expect(storage.explanationMarkdown).toContain("No rejects a stale replacement")
  expect(storage.explanationMarkdown).toContain("without creating Temp JSON, calling Rename")
  expect(storage.title).toBe("Serialized revision check")
  expect(storage.explanationMarkdown).toContain("Queue supplies the request's expected revision")
  expect(storage.explanationMarkdown).toContain("Read rev supplies the current revision")
  expect(storage.explanationMarkdown).toContain("Only after a match")
  expect(storage.explanationMarkdown).toContain("cannot enter between Read rev, Match?, and Rename")
  expect(commit.explanationMarkdown).toContain("accepted replacement from Match?")
  expect(commit.explanationMarkdown).toContain("within the same serialized Store operation")
  expect(commit.explanationMarkdown).toContain("Rename is the commit boundary")
  expect(commit.explanationMarkdown).toContain("confirms persistence, not rendering")
  expect(commit.explanationMarkdown).toContain("r_e = r_s,\\quad r_{next} = r_s + 1")

  const handoff = deck(document, "architecture-boundary")
  expect(handoff.slides.map((slide) => slide.id)).toEqual(["architecture-boundary-slide"])
  const [link] = handoff.slides
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

function expectTeachingClaims(document: SketchbookDocument, name: (typeof assets)[number]) {
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
} as const

function fixtureMarkdown(document: SketchbookDocument) {
  return document.blocks.flatMap((block) =>
    block.type === "markdown"
      ? [block.markdown]
      : block.slides.map((slide) => slide.explanationMarkdown),
  )
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
    expect(fields.description).toMatch(/when/i)
    expect(skill.split("\n").length).toBeLessThan(100)
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
    expect(resources).toHaveLength(4)

    for (const file of [skillFile, ...resources.filter((path) => path.endsWith(".md"))]) {
      for (const link of localLinks(await readFile(file, "utf8"))) {
        expect(link, "Bundled links must be relative local paths").not.toMatch(/^(?:[a-z]+:|\/)/i)
        const target = resolve(dirname(file), link.split("#")[0])
        expect(isWithinSkill(target), `${file}: ${link}`).toBe(true)
        expect(isWithinSkill(await realpath(target)), `${file}: ${link}`).toBe(true)
      }
    }
  })

  for (const name of assets) {
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

  test.each(assets)(
    "%s has the reviewed article outline and compact teaching labels",
    async (name) => {
      const document = validateDocument(await loadFixture(name))
      expectArticleOutline(document, name)
      expectCompactLabels(document)
      for (const markdown of fixtureMarkdown(document)) expectParsedEmphasis(markdown)
    },
  )

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

  test.each(assets)("label checks catch long labels and horizontal chains in %s", async (name) => {
    const document = validateDocument(await loadFixture(name))
    const deck = document.blocks.find(
      (block): block is DiagramDeck => block.type === "diagram-deck",
    )
    if (!deck) throw new Error("Missing teaching deck")
    const source = deck.slides[0].mermaid
    deck.slides[0].mermaid = source.replace(
      /"[^"]+"/,
      '"A long prose explanation that belongs in Markdown"',
    )
    expect(() => validateDocument(document)).not.toThrow()
    expect(() => expectCompactLabels(document)).toThrow()
    deck.slides[0].mermaid = source.replace("flowchart TD", "flowchart LR")
    expect(() => validateDocument(document)).not.toThrow()
    expect(() => expectCompactLabels(document)).toThrow()
  })

  test("teaching facts and compact review records cover every slide across both decks", async () => {
    const cases = await loadReviewCases()
    expect(cases.scope).toContain("not a universal semantic linter")
    expect(cases.cases.map((item) => item.asset)).toEqual(assets)
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

  test.each(assets)("%s has its reviewed source-supported contributions", async (name) => {
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
      index: 1,
      failure: "wrong storage handoff recipient",
      from: 'Valid -->|Yes| Store["Store"]',
      to: 'Valid -->|Yes| Client["Client"]',
    },
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-deck",
      index: 1,
      failure: "lost validation rejection outcome",
      from: '  Valid -->|No| Invalid["No write"]',
      to: "",
    },
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-deck",
      index: 2,
      failure: "lost revision no-write outcome",
      from: '  Compare -->|No| Conflict["No write"]',
      to: "",
    },
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-deck",
      index: 2,
      failure: "lost queued expected revision input",
      from: '  Queue -->|expected rev| Compare{"Match?"}\n',
      to: "",
    },
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-deck",
      index: 2,
      failure: "lost current revision input",
      from: "  Current -->|current rev| Compare\n",
      to: "",
    },
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-deck",
      index: 3,
      failure: "rename before temporary write",
      from: '  Temp["Temp JSON"] --> Commit["Rename"]',
      to: '  Commit["Rename"] --> Temp["Temp JSON"]',
    },
    {
      asset: "architecture-walkthrough.json",
      deckId: "architecture-deck",
      index: 2,
      failure: "current revision read before serialization",
      from: '  Queue["Queue"] --> Current["Read rev"]',
      to: '  Current["Read rev"] --> Queue["Queue"]',
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
    slide.mermaid = slide.mermaid.replace(from, to)
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
      const originalGraph = detail.mermaid
      // A different graph with a copied overview explanation also loses its needed contribution.
      detail.explanationMarkdown = first.slides[0].explanationMarkdown
      expect(() => validateDocument(document)).not.toThrow()
      expect(() => expectTeachingClaims(document, asset)).toThrow()
      detail.mermaid = first.slides[0].mermaid
      expect(detail.mermaid).not.toBe(originalGraph)
      expect(() => validateDocument(document)).not.toThrow()
      expect(() => expectTeachingClaims(document, asset)).toThrow()
      // This is not a graph-equality rule: the checks require the case's named inputs and outcomes.
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
    "sequenceDiagram\nAlice->>Bob: unsupported",
    "graph LR\n A --> B",
    "---\ntitle: Override\n---\nflowchart LR\n A --> B",
    '%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\n A --> B',
    'flowchart LR\n A --> B\n click A "https://example.com"',
    'flowchart LR\n A["<b>HTML label</b>"]',
    'flowchart LR\n A@{ img: "https://example.com/image.png" }',
    'flowchart LR\n A@{ icon: "fa:home" }',
  ])("rejects unsupported or unsafe Mermaid source: %s", async (mermaid) => {
    const fixture = await loadFixture("architecture-walkthrough.json")
    const deck = fixture.blocks.find((block: { type: string }) => block.type === "diagram-deck")
    deck.slides[0].mermaid = mermaid
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
