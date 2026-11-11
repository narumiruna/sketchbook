import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises"
import { networkInterfaces, tmpdir } from "node:os"
import { join, resolve } from "node:path"
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
import { chromium } from "@playwright/test"
import { Check } from "typebox/value"
import type { SketchbookDocument } from "../src/document.js"

const execute = promisify(execFile)
const root = resolve(import.meta.dirname, "..")
const temporary = await realpath(await mkdtemp(join(tmpdir(), "pi-sketchbook-package-")))

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
    "sketchbook_open",
    "sketchbook_read",
    "sketchbook_write",
  ])
  assert.equal(extension.flags.size, 0, "The viewer must not require host flags")
  const skills = loader.getSkills()
  assert.deepEqual(skills.diagnostics, [])
  assert.equal(skills.skills.length, 1)
  assert.equal(skills.skills[0].name, "sketchbook-explain-diagrams")

  // Queue expansion exercises Pi's public skill command path without requesting a model turn.
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
    assert.equal(
      await session.followUp("/skill:sketchbook-explain-diagrams Explain the API architecture."),
      "queued",
    )
    const expanded = session.getFollowUpMessages()[0]
    assert.ok(expanded.includes('<skill name="sketchbook-explain-diagrams"'))
    assert.ok(expanded.includes("sketchbook_write"))
    assert.ok(expanded.endsWith("Explain the API architecture."))
    assert.ok(session.getActiveToolNames().includes("sketchbook_write"))

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
    const document: SketchbookDocument = JSON.parse(
      await readFile(
        join(
          packagePath,
          "skills/sketchbook-explain-diagrams/assets/architecture-walkthrough.json",
        ),
        "utf8",
      ),
    )
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
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      const external: string[] = []
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== url.origin) external.push(request.url())
      })
      await page.goto(url.href)
      await page.locator(".diagram-svg svg").first().waitFor({ timeout: 30_000 })
      assert.equal(await page.title(), `${document.title} — Pi Sketchbook`)
      assert.equal(await page.locator(".brand").textContent(), "Pi Sketchbook")
      // Math belongs to its explanatory slide, not necessarily the first view.
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
      `Passed ${label}: Pi discovery, skill command expansion, automatic LAN URL without flags, tools, packed browser assets, shutdown`,
    )
  } finally {
    for (const handler of extension.handlers.get("session_shutdown") ?? []) {
      await handler({ type: "session_shutdown", reason: "quit" }, { cwd: workspace, mode: "rpc" })
    }
    session.dispose()
  }
}

async function smokeMcp(tarball: string): Promise<void> {
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
  await assert.rejects(stat(join(install, "node_modules/@earendil-works/pi-coding-agent")))
  const help = await execute(
    "npx",
    ["--no", "--package=@narumitw/sketchbook", "--", "sketchbook-mcp", "--help"],
    { cwd: install, timeout: 10_000 },
  )
  assert.equal(help.stdout, "Usage: sketchbook-mcp [--cwd <workspace-directory>]\n")
  assert.equal(help.stderr, "")
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@narumitw/sketchbook"],
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
      "sketchbook_open",
      "sketchbook_read",
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
              mermaid: "flowchart LR\nClient --> Server --> Store",
              explanationMarkdown: "The MCP server saves the document in the selected workspace.",
            },
          ],
        },
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
      await page.locator(".diagram-svg svg").waitFor({ timeout: 30_000 })
      assert.equal(await page.title(), "Standalone MCP — Pi Sketchbook")
    } finally {
      await browser.close()
    }
    await client.close()
    await assert.rejects(fetch(endpoint, { headers, signal: AbortSignal.timeout(2000) }))
    assert.equal(stderr, "")
    console.log(
      "Passed standalone MCP: npx executable without Pi, tools, browser assets, EOF shutdown",
    )
  } finally {
    await client.close()
  }
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
  assert.ok(files.includes("skills/sketchbook-explain-diagrams/SKILL.md"))
  assert.ok(files.includes("README.md") && files.includes("LICENSE"))
  assert.ok(files.includes("docs/compatibility.md") && files.includes("docs/acceptance.md"))
  assert.ok(!files.some((file) => file.startsWith("docs/plans/")))
  assert.ok(!files.some((file) => /^(?:node_modules|tests|test-results|src|\.pi)\//.test(file)))
  await execute("tar", ["-xzf", join(temporary, packed.filename), "-C", temporary])
  const extracted = join(temporary, "package")
  await assert.rejects(stat(join(extracted, "node_modules")))
  await smoke(extracted, "tarball")
  await smoke(root, "local")
  await smokeMcp(join(temporary, packed.filename))
} finally {
  await rm(temporary, { recursive: true, force: true })
}
