#!/usr/bin/env node
import { realpath, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createSketchbookMcpServer } from "./mcp.js"

const usage = "Usage: sketchbook-mcp [--cwd <workspace-directory>]\n"

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { cwd: { type: "string" }, help: { type: "boolean", short: "h" } },
    allowPositionals: false,
    strict: true,
  })
  if (values.help) {
    process.stdout.write(usage)
    return
  }
  if (values.cwd !== undefined && !values.cwd.trim()) throw new Error(usage.trim())
  const cwd = await realpath(resolve(values.cwd ?? process.cwd()))
  if (!(await stat(cwd)).isDirectory()) throw new Error("Workspace must be an existing directory.")

  const { server, close } = createSketchbookMcpServer(cwd)
  let stopping: Promise<void> | undefined
  const stop = (): Promise<void> => {
    stopping ??= close().finally(() => {
      process.stdin.off("end", onEnd)
      process.stdin.off("error", onInputError)
      process.stdout.off("error", onOutputError)
      process.off("SIGINT", onSignal)
      process.off("SIGTERM", onSignal)
    })
    return stopping
  }
  const reportFailure = (): void => {
    // Do not log protocol payloads, document content, or viewer capability URLs.
    process.stderr.write("Sketchbook MCP server failed.\n")
    process.exitCode = 1
    void stop().catch(() => {})
  }
  const onEnd = (): void => {
    void stop().catch(reportFailure)
  }
  const onSignal = (): void => {
    void stop().catch(reportFailure)
  }
  const onInputError = (): void => reportFailure()
  const onOutputError = (): void => reportFailure()
  server.onerror = () => {
    // Parse and request errors can be recovered by the client. Keep stdout protocol-only.
    process.stderr.write("Sketchbook MCP protocol error.\n")
  }
  process.stdin.once("end", onEnd)
  process.stdin.once("error", onInputError)
  process.stdout.once("error", onOutputError)
  process.once("SIGINT", onSignal)
  process.once("SIGTERM", onSignal)
  try {
    await server.connect(new StdioServerTransport())
  } catch (error) {
    await stop()
    throw error
  }
}

try {
  await main()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Sketchbook MCP startup failed."}\n`,
  )
  process.exitCode = 1
}
