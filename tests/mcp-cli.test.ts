import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process"
import { once } from "node:events"
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const execute = promisify(execFile)
const entry = fileURLToPath(new URL("../src/mcp-cli.ts", import.meta.url))
const args = ["--import", import.meta.resolve("tsx"), entry]
const document = {
  schemaVersion: 1,
  title: "MCP stdio fixture",
  blocks: [{ id: "intro", type: "markdown", markdown: "Stdio document." }],
}

describe("MCP stdio executable", () => {
  let temporary: string
  let workspace: string
  const children: ChildProcessWithoutNullStreams[] = []

  beforeEach(async () => {
    temporary = await realpath(await mkdtemp(join(tmpdir(), "sketchbook-mcp-cli-")))
    workspace = join(temporary, "workspace with spaces")
    await mkdir(workspace)
  })

  afterEach(async () => {
    await Promise.all(
      children.splice(0).map(async (child) => {
        if (child.exitCode !== null || child.signalCode !== null) return
        const exited = once(child, "exit")
        child.kill("SIGKILL")
        await exited
      }),
    )
    await rm(temporary, { recursive: true, force: true })
  })

  it("shows help without creating files or starting a protocol session", async () => {
    const { stdout, stderr } = await execute(process.execPath, [...args, "--help"], {
      cwd: temporary,
    })
    expect(stdout).toBe("Usage: sketchbook-mcp --cwd <workspace-directory>\n")
    expect(stderr).toBe("")
    await expect(access(join(temporary, ".pi"))).rejects.toThrow()
  })

  it.each([[], ["--cwd", ""], ["--unknown"], ["extra"]])(
    "rejects invalid arguments %j without stdout output",
    async (...input) => {
      await expect(
        execute(process.execPath, [...args, ...input], { cwd: temporary }),
      ).rejects.toMatchObject({ code: 1, stdout: "", stderr: expect.any(String) })
      await expect(access(join(temporary, ".pi"))).rejects.toThrow()
    },
  )

  it("rejects nonexistent and non-directory workspaces without creating them", async () => {
    const file = join(temporary, "file")
    await writeFile(file, "Not a directory")
    for (const cwd of [join(temporary, "missing"), file]) {
      await expect(
        execute(process.execPath, [...args, "--cwd", cwd], { cwd: temporary }),
      ).rejects.toMatchObject({ code: 1, stdout: "" })
    }
    await expect(access(join(temporary, "missing"))).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe("Not a directory")
  })

  it.each(["EOF", "SIGINT", "SIGTERM"] as const)(
    "keeps stdout protocol-only, uses --cwd, and closes the viewer on %s",
    async (stop) => {
      const child = spawn(process.execPath, [...args, "--cwd", workspace], {
        cwd: temporary,
        stdio: "pipe",
      })
      children.push(child)
      const exited = once(child, "exit")
      const lines = createInterface({ input: child.stdout })
      let stderr = ""
      child.stderr.on("data", (chunk) => {
        stderr += chunk
      })
      let id = 0
      async function request(method: string, params: object) {
        const response = once(lines, "line")
        const requestId = ++id
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`)
        const [line] = await response
        const parsed = JSON.parse(line)
        expect(parsed).toMatchObject({ jsonrpc: "2.0", id: requestId })
        expect(parsed.error).toBeUndefined()
        return parsed.result
      }
      try {
        const initialized = await request("initialize", {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "stdio-test", version: "1.0.0" },
        })
        expect(initialized.serverInfo.name).toBe("sketchbook")
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
        )
        const listed = await request("tools/list", {})
        expect(listed.tools).toHaveLength(3)
        await expect(access(join(workspace, ".pi"))).rejects.toThrow()
        const created = await request("tools/call", {
          name: "sketchbook_write",
          arguments: { document },
        })
        expect(created.structuredContent.ok).toBe(true)
        expect(created.structuredContent.path).toBe(
          join(workspace, ".pi/sketchbook", `${created.structuredContent.documentId}.json`),
        )
        await expect(access(join(temporary, ".pi"))).rejects.toThrow()
        const opened = await request("tools/call", {
          name: "sketchbook_open",
          arguments: { documentId: created.structuredContent.documentId },
        })
        expect(opened.structuredContent.ok).toBe(true)
        const url = new URL(opened.structuredContent.url)
        const endpoint = new URL(`/api/documents/${created.structuredContent.documentId}`, url)
        const headers = {
          Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get("token")}`,
        }
        expect((await fetch(endpoint, { headers })).status).toBe(200)
        if (stop === "EOF") child.stdin.end()
        else child.kill(stop)
        expect(await exited).toEqual([0, null])
        await expect(fetch(endpoint, { headers })).rejects.toThrow()
        expect(stderr).toBe("")
        const stored = JSON.parse(await readFile(created.structuredContent.path, "utf8"))
        expect(stored.document).toEqual(document)
      } finally {
        lines.close()
      }
    },
    10_000,
  )
})
