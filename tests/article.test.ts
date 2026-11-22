import { readFile } from "node:fs/promises"
import { describe, expect, test } from "vitest"
import { type SketchbookDocument, validateDocument } from "../src/document.js"
import { mermaidDeck as deck } from "./fixtures/mermaid-deck.js"

async function fixture(): Promise<SketchbookDocument> {
  return validateDocument(
    JSON.parse(await readFile(new URL("./fixtures/agent-substrate.json", import.meta.url), "utf8")),
  )
}

function expectCompleteEgressPaths(source: string) {
  expect(source).toContain('Policy{"政策"} -->|"拒絕"| Denied(')
  expect(source).toContain('Policy -->|"允許並注入"| Inject(')
  expect(source).toContain('Policy -->|"允許"| External[')
  expect(source).toContain("Inject --> External")
}

describe("Agent Substrate article regression", () => {
  test("defines the minimal model before two stable chapters and closes both main questions", async () => {
    const document = await fixture()
    expect(document.title).toBe("Agent Substrate")
    expect(document.blocks.map((block) => block.id)).toEqual([
      "intro",
      "execution-deck",
      "security-deck",
      "takeaways",
    ])
    const intro = document.blocks[0]
    const takeaways = document.blocks.at(-1)
    if (intro.type !== "markdown" || takeaways?.type !== "markdown") {
      throw new Error("Expected article introduction and conclusion")
    }
    expect(intro.markdown).toMatch(/^## 入門\n/)
    for (const term of ["Actor", "Worker Pod", "Snapshot"]) {
      expect(intro.markdown).toContain(`**${term}**：`)
    }
    expect(intro.markdown).toContain("已建立、目前暫停的 Actor A")
    expect(intro.markdown).not.toContain("| ---")
    expect(intro.markdown).not.toContain("ActorTemplate")
    expect(takeaways.markdown).toContain("**容量**：")
    expect(takeaways.markdown).toContain("**狀態**：")
    expect(takeaways.markdown).toContain("**安全**：")
    expect(takeaways.markdown).toContain("### 技術名稱對照")
    expect(takeaways.markdown).toContain("## 參考資料")
    for (const block of document.blocks) {
      if (block.type !== "markdown" && block.type !== "diagram-deck") continue
      const prose =
        block.type === "markdown"
          ? [block.markdown]
          : block.slides.map((slide) => slide.explanationMarkdown)
      for (const text of prose) {
        expect(text).not.toMatch(/^# /m)
        expect(text).not.toMatch(/\*\*[^*\n]+[：。]\*\*\p{L}/u)
      }
    }
  })

  test("shows multiplexing, preserves lifecycle caveats, and retains stable component names", async () => {
    const document = await fixture()
    const execution = deck(document, "execution-deck")
    const security = deck(document, "security-deck")
    expect(execution.title).toBe("運作方式")
    expect(security.title).toBe("安全隔離")
    expect(execution.slides.map((slide) => slide.id)).toEqual([
      "execution-overview",
      "execution-resume",
      "execution-suspend",
    ])
    const [overview, resume, suspend] = execution.slides
    for (const actor of ["Actor A", "Actor B", "Actor C"]) {
      expect(overview.mermaid).toContain(actor)
    }
    expect(overview.explanationMarkdown).toContain("不是三者同時在此執行")
    expect(resume.explanationMarkdown).toContain("首次執行")
    expect(resume.explanationMarkdown).toContain("後續恢復")
    expect(suspend.explanationMarkdown).toContain("明確要求 `SuspendActor`")
    expect(suspend.explanationMarkdown).toContain("上傳完成前節點故障")
    expect(suspend.explanationMarkdown).toContain("同步模式則等待上傳完成")
    for (const slide of [...execution.slides, ...security.slides]) {
      expect(slide.mermaid).toContain('Actor["Actor A"]')
      expect(slide.explanationMarkdown).not.toMatch(/\*\*(?:承接前頁|本組主問題|連回第一組)/)
    }
    expect(security.slides[0].mermaid).toContain('subgraph Worker["Worker Pod"]')
    expect(security.slides[0].mermaid).toContain('subgraph Sandbox["獨立 Sandbox"]')
  })

  test("keeps both allowed egress paths separate from denial", async () => {
    const source = deck(await fixture(), "security-deck").slides[1].mermaid
    expectCompleteEgressPaths(source)
    expect(() =>
      expectCompleteEgressPaths(source.replace('Policy -->|"允許"| External["外部 API"]', "")),
    ).toThrow()
  })
})
