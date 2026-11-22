import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises"
import { networkInterfaces, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import {
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionToolContext,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { type Browser, chromium, type Locator } from "@playwright/test"
import { Check } from "typebox/value"
import type { SketchbookDocument } from "../src/document.js"

const execute = promisify(execFile)
const root = resolve(import.meta.dirname, "..")
const temporary = await realpath(await mkdtemp(join(tmpdir(), "pi-sketchbook-package-")))

async function cacheSlide(packagePath: string) {
  const file = join(packagePath, "examples/diagram-design/http-cache-walkthrough.json")
  const document = JSON.parse(await readFile(file, "utf8")) as SketchbookDocument
  const deck = document.blocks.find((block) => block.type === "diagram-deck")
  const slide = deck?.slides[0]
  assert.ok(slide)
  return slide
}

async function checkSvg(deck: Locator, slide: { id: string; title: string }) {
  await deck.locator(`button[data-slide-id="${slide.id}"]`).click()
  await deck.getByRole("img", { name: slide.title, exact: true }).waitFor({ timeout: 30_000 })
  assert.match((await deck.locator(".static-diagram img").getAttribute("src")) ?? "", /^blob:/)
  assert.equal(await deck.locator(".diagram-controls").count(), 0)
}

async function cachePage(): Promise<
  Extract<SketchbookDocument["blocks"][number], { type: "diagram-html" }>
> {
  return {
    id: "cache-html",
    type: "diagram-html",
    title: "Browser caching with Diagram Design",
    html: await readFile(join(root, "tests/fixtures/cache-design.html"), "utf8"),
  }
}

async function checkDesignPage(frame: Locator) {
  await frame.contentFrame().getByRole("heading", { name: "同一個檔案，不一定要再下載" }).waitFor()
  assert.equal(await frame.contentFrame().locator("svg").count(), 3)
}

async function checkCacheBook(
  browser: Browser,
  design: Awaited<ReturnType<typeof cachePage>>,
  call: (name: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>,
) {
  const { html } = design
  const sections = [...html.matchAll(/<section aria-labelledby="([^"]+)">([\s\S]*?)<\/section>/g)]
  assert.equal(sections.length, 3)
  const chapters = sections.map(([section, headingId, content], index) => {
    const title = ["直接用快取副本", "過期後如何驗證", "完整快取決策流程"][index]
    const heading = /<h2[^>]*>([^<]+)<\/h2>/.exec(content)?.[1]
    assert.ok(heading)
    const header = index === 0 ? /<header>[\s\S]*?<\/header>/.exec(html)?.[0] : ""
    const pageHtml = `${html.slice(0, html.indexOf("<main>"))}<main>${header}${section}</main></body></html>`
    return {
      id: headingId.replace("-heading", ""),
      title,
      heading,
      block: { ...design, title, html: pageHtml },
    }
  })
  const [first, ...remaining] = chapters
  const saved = await call("sketchbook_write", {
    document: { schemaVersion: 1, title: first.title, blocks: [first.block] },
  })
  let expectedRevision = 0
  for (const { id, title, block } of remaining) {
    const updated = await call("sketchbook_edit", {
      documentId: saved.documentId,
      expectedRevision,
      operation: { type: "add-chapter", chapter: { id, title, blocks: [block], sections: [] } },
    })
    assert.equal(updated.revision, ++expectedRevision)
  }
  const opened = await call("sketchbook_open", { documentId: saved.documentId })
  const url = new URL(String(opened.url))
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const external: string[] = []
    try {
      page.on("request", (request) => {
        const origin = new URL(request.url()).origin
        if (origin !== "null" && origin !== url.origin) external.push(origin)
      })
      await page.goto(url.href)
      const contents = page.getByRole("navigation", { name: "Book contents" })
      for (const { id, title, heading } of chapters) {
        await contents.getByRole("link", { name: title }).click()
        const frame = page.locator("iframe.design-page")
        const inner = frame.contentFrame()
        await inner.getByRole("heading", { name: heading, exact: true }).waitFor()
        assert.equal(await inner.locator("svg").count(), 1)
        assert.ok(await inner.locator("svg").isVisible())
        assert.ok(await inner.locator("figcaption").isVisible())
        assert.equal(await page.locator(".diagram-viewport, .diagram-controls").count(), 0)
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        )
        assert.deepEqual(external, [], "Cache chapters must load without external resources")
        await page.screenshot({
          path: join(root, "test-results", `package-cache-${id}-${width}.png`),
          fullPage: true,
        })
        if (width === 390) {
          const offset = await inner.locator(".diagram-container").evaluate((container) => {
            container.scrollLeft = container.scrollWidth
            return container.scrollLeft
          })
          assert.ok(offset > 0, "The diagram must scroll within its own container")
          await page.screenshot({
            path: join(root, "test-results", `package-cache-${id}-390-scrolled.png`),
            fullPage: true,
          })
        }
      }
    } finally {
      await page.close()
    }
  }
}

async function smoke(packagePath: string, label: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(packagePath, "package.json"), "utf8"))
  assert.equal(manifest.name, "@narumitw/sketchbook")
  const workspace = join(temporary, label)
  const agentDir = join(workspace, "agent")
  await mkdir(workspace, { recursive: true })
  const settingsManager = SettingsManager.inMemory({ cacheWarming: "off" })
  const loader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [packagePath],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  })
  await loader.reload()
  const loaded = loader.getExtensions()
  assert.deepEqual(loaded.errors, [], "Pi must load compiled ESM without source dependencies")
  assert.deepEqual(loaded.warnings ?? [], [], "Pi must not find bundled host copies")
  assert.equal(loaded.extensions.length, 1)
  const extension = loaded.extensions[0]
  assert.deepEqual([...extension.tools.keys()].sort(), [
    "sketchbook_edit",
    "sketchbook_open",
    "sketchbook_read",
    "sketchbook_read_book",
    "sketchbook_write",
  ])
  assert.equal(extension.flags.size, 0, "The viewer must not require host flags")
  const skills = loader.getSkills()
  assert.deepEqual(skills.diagnostics, [])
  assert.deepEqual(
    skills.skills.map((skill) => skill.name),
    ["sketchbook"],
  )
  assert.equal(
    skills.skills[0].filePath,
    join(packagePath, "skills/sketchbook/SKILL.md"),
    "Pi must discover the skill from the package being tested",
  )

  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  })
  modelRuntime.streamSimple = () => {
    throw new Error("Package smoke must not call a model")
  }
  const { session } = await createAgentSession({
    cwd: workspace,
    agentDir,
    resourceLoader: loader,
    settingsManager,
    modelRuntime,
    model: modelRuntime.getModels()[0],
    sessionManager: SessionManager.inMemory(workspace),
  })
  const errors: string[] = []
  await session.bindExtensions({ mode: "rpc", onError: (error) => errors.push(error.error) })
  try {
    const question = "What is an npm lifecycle script?"
    assert.equal(await session.followUp(`/skill:sketchbook ${question}`), "queued")
    const expanded = session.getFollowUpMessages()[0]
    assert.ok(expanded.includes('<skill name="sketchbook"'))
    assert.ok(expanded.includes("even if the question is simple"))
    assert.ok(expanded.endsWith(question))
    assert.ok(expanded.includes("upstream/GUIDE.md"))
    for (const name of ["sketchbook_write", "sketchbook_open"]) {
      assert.ok(expanded.includes(name))
      assert.ok(session.getActiveToolNames().includes(name))
    }
    const packagedUpstream = join(packagePath, "skills/sketchbook/upstream")
    for (const name of ["GUIDE.md", "LICENSE", "assets/template.html", "scripts/export_svg.py"]) {
      assert.ok((await stat(join(packagedUpstream, name))).isFile())
    }

    const ctx = { cwd: workspace, mode: "rpc" } as ExtensionToolContext
    async function call(name: string, input: unknown) {
      const tool = extension.tools.get(name)?.definition
      assert.ok(tool, `Missing tool ${name}`)
      assert.ok(Check(tool.parameters, input))
      const result = await tool.execute("package-smoke", input, undefined, undefined, ctx)
      assert.ok(!result.isError, JSON.stringify(result.content))
      assert.ok(tool.outputSchema && Check(tool.outputSchema, result.structuredContent))
      return result.structuredContent as Record<string, unknown>
    }
    const svgSlide = await cacheSlide(packagePath)
    const document: SketchbookDocument = {
      schemaVersion: 1,
      title: "Packaged book",
      blocks: [
        {
          id: "intro",
          type: "markdown",
          markdown: "Read the example and compare the two explanations.",
        },
        { id: "example", type: "code", code: "Cache-Control: max-age=60" },
        {
          id: "svg-deck",
          type: "diagram-deck",
          title: "Static SVG",
          slides: [
            svgSlide,
            {
              ...svgSlide,
              id: "formula",
              title: "Formula",
              explanationMarkdown: "For example $x^2$.",
            },
          ],
        },
        await cachePage(),
      ],
    }
    const created = await call("sketchbook_write", { document })
    assert.equal(created.path, join(workspace, ".pi/sketchbook", `${created.documentId}.json`))
    assert.equal(created.renderingVerified, false)
    assert.equal(created.revision, 1)
    const read = await call("sketchbook_read", { documentId: created.documentId })
    assert.deepEqual((read.stored as { document: unknown }).document, document)
    const opened = await call("sketchbook_open", { documentId: created.documentId })
    assert.equal(opened.renderingVerified, false)
    const url = new URL(String(opened.url))
    const privateAddress = Object.values(networkInterfaces())
      .flat()
      .find(
        (entry) =>
          entry?.family === "IPv4" &&
          !entry.internal &&
          /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(entry.address),
      )?.address
    assert.equal(url.hostname, privateAddress ?? "127.0.0.1")
    assert.notEqual(url.hostname, "0.0.0.0")
    const token = new URLSearchParams(url.hash.slice(1)).get("token")
    assert.ok(token)
    const response = await fetch(new URL(`/api/documents/${created.documentId}`, url), {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(response.status, 200)
    const stored = (await response.json()) as { revision: number }
    assert.equal(stored.revision, 1)
    const section = { id: "details", title: "Details", blocks: [] }
    const added = await call("sketchbook_edit", {
      documentId: created.documentId,
      expectedRevision: 0,
      operation: { type: "add-section", section },
    })
    assert.equal(added.record, "book")
    const book = await call("sketchbook_read_book", { documentId: created.documentId })
    assert.deepEqual((book.book as { sections: unknown }).sections, [section])
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      const external: string[] = []
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== url.origin) external.push(request.url())
      })
      await page.goto(url.href)
      await page.locator(".static-diagram img").waitFor({ timeout: 30_000 })
      assert.equal(await page.title(), `${document.title} — Sketchbook`)
      assert.equal(await page.locator(".brand").textContent(), "Sketchbook")
      await checkSvg(page.locator('[data-block-id="svg-deck"]'), svgSlide)
      await checkDesignPage(page.locator('iframe[data-block-id="cache-html"]'))
      const mathDeck = document.blocks.find(
        (block) =>
          block.type === "diagram-deck" &&
          block.slides.some((slide) => slide.explanationMarkdown.includes("$")),
      )
      assert.ok(mathDeck?.type === "diagram-deck", "Mixed-format fixture must include a math slide")
      const mathSlide = mathDeck.slides.find((slide) => slide.explanationMarkdown.includes("$"))
      assert.ok(mathSlide)
      const deck = page.locator(`[data-block-id="${mathDeck.id}"]`)
      if (mathDeck.slides.length > 1)
        await deck.locator(`button[data-slide-id="${mathSlide.id}"]`).click()
      await deck.locator(".katex").first().waitFor({ timeout: 30_000 })
      assert.ok((await deck.locator(".katex").count()) > 0)
      assert.deepEqual(external, [], "Packed viewer must work without external requests")
      await page.screenshot({
        path: join(root, "test-results", `package-${label}.png`),
        fullPage: true,
      })
    } finally {
      await browser.close()
    }
    for (const handler of extension.handlers.get("session_shutdown") ?? []) {
      await handler({ type: "session_shutdown", reason: "reload" }, ctx)
    }
    await assert.rejects(fetch(url.origin, { signal: AbortSignal.timeout(2000) }))
    assert.deepEqual(errors, [])
    console.log(
      `Passed ${label}: Pi discovery, skill command expansion, automatic LAN URL without flags, tools, packed browser assets and static diagrams, shutdown`,
    )
  } finally {
    for (const handler of extension.handlers.get("session_shutdown") ?? []) {
      await handler({ type: "session_shutdown", reason: "quit" }, { cwd: workspace, mode: "rpc" })
    }
    session.dispose()
  }
}

async function smokeGit(): Promise<void> {
  const source = "https://github.com/narumiruna/sketchbook"
  const repository = join(temporary, "git-source")
  for (const path of [
    ".gitignore",
    "examples/diagram-design",
    "package.json",
    "package-lock.json",
    "scripts",
    "skills/sketchbook/SKILL.md",
    "skills/sketchbook/references",
    "src",
    "tsconfig.json",
    "tsconfig.web.json",
    "vite.config.ts",
  ]) {
    await cp(join(root, path), join(repository, path), { recursive: true })
  }
  const git = (args: string[], cwd = repository) =>
    execute("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Package test",
        GIT_AUTHOR_EMAIL: "package-test@example.invalid",
        GIT_COMMITTER_NAME: "Package test",
        GIT_COMMITTER_EMAIL: "package-test@example.invalid",
      },
    })
  await git(["init", "-b", "main"])
  await git(["add", "."])
  await git(["commit", "-m", "test: create Git package fixture"])

  const agentDir = join(temporary, "git-agent")
  const pi = (args: string[]) =>
    execute("pi", args, {
      cwd: temporary,
      timeout: 180_000,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_TELEMETRY: "0",
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: `url.${pathToFileURL(repository).href}.insteadOf`,
        GIT_CONFIG_VALUE_0: source,
      },
    })
  const installed = join(agentDir, "git/github.com/narumiruna/sketchbook")
  await pi(["install", source])
  for (const path of [
    "dist/extension.js",
    "dist/web/index.html",
    "skills/sketchbook/upstream/GUIDE.md",
  ]) {
    assert.ok((await stat(join(installed, path))).isFile(), `Missing Git install output: ${path}`)
  }

  await git(["commit", "--allow-empty", "-m", "test: advance Git package fixture"])
  await pi(["update", source])
  assert.equal(
    (await git(["rev-parse", "HEAD"], installed)).stdout.trim(),
    (await git(["rev-parse", "HEAD"])).stdout.trim(),
  )
  for (const name of ["vite", "typebox", "@earendil-works/pi-coding-agent"]) {
    await assert.rejects(stat(join(installed, "node_modules", name)), { code: "ENOENT" })
  }
  await smoke(installed, "Git install and update")
}

async function smokeMcp(tarball: string): Promise<string> {
  const npmEnvironment = { npm_config_update_notifier: "false" }
  const install = join(temporary, "mcp-install")
  const workspace = join(install, "workspace")
  await mkdir(install)
  await mkdir(workspace)
  await writeFile(join(install, "package.json"), JSON.stringify({ private: true }))
  await execute(
    "npm",
    ["install", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", tarball],
    { cwd: install, timeout: 120_000 },
  )
  for (const name of ["@earendil-works/pi-coding-agent", "mermaid", "@narumitw/diagram-viewer"]) {
    await assert.rejects(stat(join(install, "node_modules", name)), { code: "ENOENT" })
  }
  const installed = join(install, "node_modules/@narumitw/sketchbook")
  const svgSlide = await cacheSlide(installed)
  const designPage = await cachePage()
  const help = await execute(
    "npx",
    ["--no", "--package=@narumitw/sketchbook", "--", "sketchbook-mcp", "--help"],
    { cwd: install, timeout: 10_000, env: { ...process.env, ...npmEnvironment } },
  )
  assert.equal(help.stdout, "Usage: sketchbook-mcp [--cwd <workspace-directory>]\n")
  assert.equal(help.stderr, "")
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@narumitw/sketchbook"],
    env: npmEnvironment,
    cwd: workspace,
    stderr: "pipe",
  })
  let stderr = ""
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk
  })
  const client = new Client({ name: "package-smoke", version: "1.0.0" })
  try {
    await client.connect(transport)
    const listed = await client.listTools()
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
      "sketchbook_edit",
      "sketchbook_open",
      "sketchbook_read",
      "sketchbook_read_book",
      "sketchbook_write",
    ])
    const document: SketchbookDocument = {
      schemaVersion: 1,
      title: "Standalone MCP",
      blocks: [
        {
          id: "deck",
          type: "diagram-deck",
          title: "Overview",
          slides: [
            {
              id: "overview",
              title: "MCP tool flow",
              svg: svgSlide.svg,
              explanationMarkdown: "The MCP server saves the document in the selected workspace.",
            },
            svgSlide,
          ],
        },
        designPage,
      ],
    }
    async function call(name: string, input: Record<string, unknown>) {
      const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: input }))
      assert.ok(!result.isError, "MCP tool must succeed")
      assert.ok(result.structuredContent)
      return result.structuredContent
    }
    const created = await call("sketchbook_write", { document })
    assert.equal(created.path, join(workspace, ".pi/sketchbook", `${created.documentId}.json`))
    assert.equal(created.revision, 1)
    const read = await call("sketchbook_read", { documentId: created.documentId })
    assert.deepEqual((read.stored as { document: unknown }).document, document)
    const updated = await call("sketchbook_write", {
      document,
      documentId: created.documentId,
      expectedRevision: 1,
    })
    assert.equal(updated.revision, 2)
    const conflict = await client.callTool({
      name: "sketchbook_write",
      arguments: { document, documentId: created.documentId, expectedRevision: 1 },
    })
    assert.equal(conflict.isError, true)
    const chapter = { id: "details", title: "Details", blocks: [], sections: [] }
    const added = await call("sketchbook_edit", {
      documentId: created.documentId,
      expectedRevision: 0,
      operation: { type: "add-chapter", chapter },
    })
    assert.equal(added.record, "book")
    const book = await call("sketchbook_read_book", { documentId: created.documentId })
    assert.deepEqual((book.book as { chapters: unknown }).chapters, [chapter])
    const opened = await call("sketchbook_open", { documentId: created.documentId })
    assert.equal(opened.renderingVerified, false)
    const url = new URL(String(opened.url))
    const endpoint = new URL(`/api/documents/${created.documentId}`, url)
    assert.equal((await fetch(endpoint)).status, 401)
    const headers = {
      Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("token")}`,
    }
    assert.equal((await fetch(endpoint, { headers })).status, 200)
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(url.href)
      await page.locator(".static-diagram img").waitFor({ timeout: 30_000 })
      assert.equal(await page.title(), "Standalone MCP — Sketchbook")
      const deck = page.locator('[data-block-id="deck"]')
      await checkSvg(deck, svgSlide)
      await checkDesignPage(page.locator('iframe[data-block-id="cache-html"]'))
      await checkCacheBook(browser, designPage, call)
    } finally {
      await browser.close()
    }
    await client.close()
    await assert.rejects(fetch(endpoint, { headers, signal: AbortSignal.timeout(2000) }))
    assert.equal(stderr, "")
    console.log(
      "Passed standalone MCP: npx executable without Pi, tools, offline browser assets, three cache chapters, and EOF shutdown",
    )
  } finally {
    await client.close()
  }
  return installed
}

try {
  await mkdir(join(root, "test-results"), { recursive: true })
  const { stdout } = await execute(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
    { cwd: root },
  )
  const [packed] = JSON.parse(stdout) as Array<{
    name: string
    filename: string
    files: Array<{ path: string }>
  }>
  assert.equal(packed.name, "@narumitw/sketchbook")
  const files = packed.files.map((file) => file.path)
  assert.ok(files.includes("dist/extension.js"))
  assert.ok(files.includes("dist/mcp-cli.js") && files.includes("dist/mcp.js"))
  assert.ok(files.includes("dist/web/index.html"))
  assert.ok(files.includes("dist/web/THIRD_PARTY_LICENSES.md"))
  assert.ok(files.includes("dist/web/EDITORIAL_FONT_LICENSES.md"))
  for (const family of [
    "instrument-serif",
    "geist",
    "geist-mono",
    "noto-sans-tc",
    "noto-serif-tc",
  ]) {
    assert.ok(
      files.some(
        (file) => file.startsWith(`dist/web/assets/${family}-`) && file.endsWith(".woff2"),
      ),
      `Missing bundled ${family} font`,
    )
  }
  for (const path of [
    "examples/diagram-design/http-cache-walkthrough.json",
    "skills/sketchbook/SKILL.md",
    "skills/sketchbook/references/document-format.md",
    "skills/sketchbook/upstream/THIRD_PARTY_LICENSES.md",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".codex-plugin/plugin.json",
    ".codex-plugin/mcp.json",
    ".agents/plugins/marketplace.json",
  ]) {
    assert.ok(files.includes(path), `Packed file missing: ${path}`)
  }
  assert.deepEqual(
    files.filter((file) => file.startsWith("skills/") && file.endsWith("/SKILL.md")),
    ["skills/sketchbook/SKILL.md"],
  )
  for (const path of ["README.md", "README.zh-TW.md", "LICENSE"]) {
    assert.ok(files.includes(path), `Packed file missing: ${path}`)
  }
  assert.ok(files.includes("docs/compatibility.md") && files.includes("docs/acceptance.md"))
  assert.ok(!files.some((file) => file.startsWith("docs/plans/")))
  assert.ok(!files.some((file) => /^(?:node_modules|tests|test-results|src|\.pi)\//.test(file)))
  await execute("tar", ["-xzf", join(temporary, packed.filename), "-C", temporary])
  const extracted = join(temporary, "package")
  await assert.rejects(stat(join(extracted, "node_modules")))
  const installed = await smokeMcp(join(temporary, packed.filename))
  await smoke(installed, "tarball")
  await smoke(root, "local")
  await smokeGit()
} finally {
  await rm(temporary, { recursive: true, force: true })
}
