import { execFile, spawnSync } from "node:child_process"
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

const execute = promisify(execFile)
const root = fileURLToPath(new URL("../", import.meta.url))
const config = `{
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "formatter": { "indentStyle": "space", "lineWidth": 100 },
  "javascript": { "formatter": { "semicolons": "asNeeded" } }
}
`
const valid = "export const value = 1\n"
const invalid = "export   const value=1;\n"
const baselinePath = "scripts/comment-baseline.json"
const retained = "// Explain a retained invariant."
const replacement = "// Explain a changed invariant."

describe("pre-commit staged validation", () => {
  let temporary: string
  let repository: string
  let snapshots: string
  let env: NodeJS.ProcessEnv

  const git = (args: string[]) => execute("git", args, { cwd: repository, env })

  beforeEach(async () => {
    temporary = await mkdtemp(join(tmpdir(), "sketchbook-pre-commit-test-"))
    repository = join(temporary, "repository")
    snapshots = join(temporary, "snapshots")
    await mkdir(join(repository, "scripts"), { recursive: true })
    await mkdir(snapshots)
    env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")))
    Object.assign(env, {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "Pre-commit test",
      GIT_AUTHOR_EMAIL: "pre-commit-test@example.invalid",
      GIT_COMMITTER_NAME: "Pre-commit test",
      GIT_COMMITTER_EMAIL: "pre-commit-test@example.invalid",
      TMPDIR: snapshots,
    })
    for (const file of [
      "pre-commit.sh",
      "staged-snapshot.mjs",
      "check-comments.mjs",
      "source-comments.mjs",
    ]) {
      const path = join("scripts", file)
      await copyFile(join(root, path), join(repository, path))
    }
    await symlink(join(root, "node_modules"), join(repository, "node_modules"), "dir")
    await writeFile(join(repository, "biome.json"), config)
    await writeFile(join(repository, ".gitignore"), "node_modules/\n")
    await writeFile(join(repository, baselinePath), "{}\n")
    await git(["init", "-b", "main"])
    await git(["add", "biome.json", ".gitignore", "scripts"])
  })

  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true })
  })

  async function worktree(directory = repository): Promise<unknown[]> {
    const entries = []
    for (const name of (await readdir(directory)).sort()) {
      if (directory === repository && name === ".git") continue
      const path = join(directory, name)
      const stat = await lstat(path)
      const content = stat.isSymbolicLink()
        ? await readlink(path)
        : stat.isDirectory()
          ? await worktree(path)
          : await readFile(path)
      entries.push([name, stat.mode, content])
    }
    return entries
  }

  async function runHook() {
    const index = await readFile(join(repository, ".git/index"))
    const files = await worktree()
    const result = spawnSync("sh", ["scripts/pre-commit.sh"], {
      cwd: repository,
      env,
      encoding: "utf8",
      timeout: 20_000,
    })
    expect(result.error).toBeUndefined()
    expect(await readFile(join(repository, ".git/index"))).toEqual(index)
    expect(await worktree()).toEqual(files)
    expect(await readdir(snapshots)).toEqual([])
    return result
  }

  async function stage(path: string, content: string) {
    await writeFile(join(repository, path), content)
    await git(["add", "--", path])
  }

  async function setHeadFromIndex() {
    const tree = (await git(["write-tree"])).stdout.trim()
    const commit = (await git(["commit-tree", tree, "-m", "test: fixture baseline"])).stdout.trim()
    await git(["update-ref", "HEAD", commit])
  }

  async function stageBaseline(...comments: string[]) {
    const baseline = comments.length
      ? `{\n  "example.js": [${comments.map((item) => JSON.stringify(item)).join(", ")}]\n}\n`
      : "{}\n"
    await stage(baselinePath, baseline)
  }

  async function seedRetainedComment() {
    await stage("example.js", `${retained}\n${valid}`)
    await stageBaseline(retained)
    await setHeadFromIndex()
  }

  test("passes an unchanged retained comment using the staged source and baseline", async () => {
    await seedRetainedComment()
    await writeFile(join(repository, "example.js"), `${replacement}\n${valid}`)
    await writeFile(join(repository, baselinePath), "{}\n")
    const result = await runHook()
    expect(result.status, result.stderr).toBe(0)
  })

  test.each([
    ["a new comment", `${retained}\n${replacement}\n`],
    ["a duplicated comment", `${retained}\n${retained}\n`],
    ["a same-length replacement", `${replacement}\n`],
  ])("rejects %s even when the worktree only has the retained comment", async (_, comments) => {
    await seedRetainedComment()
    await stage("example.js", comments + valid)
    await writeFile(join(repository, "example.js"), `${retained}\n${valid}`)
    const result = await runHook()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("new or edited comment")
  })

  test("does not transfer a retained comment to a different path", async () => {
    await seedRetainedComment()
    await stage("other.js", `${retained}\n${valid}`)
    const result = await runHook()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('"other.js":1: new or edited comment')
  })

  test("rejects growing or substituting committed baseline entries", async () => {
    await seedRetainedComment()
    for (const comments of [[retained, replacement], [replacement]]) {
      await stage("example.js", `${comments.join("\n")}\n${valid}`)
      await stageBaseline(...comments)
      const result = await runHook()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("Cannot grow or edit")
    }
  })

  test("requires shrinking the baseline and prevents restoring removed entries", async () => {
    await seedRetainedComment()
    await stage("example.js", valid)
    let result = await runHook()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Remove unused entry")
    await stageBaseline()
    result = await runHook()
    expect(result.status, result.stderr).toBe(0)
    await setHeadFromIndex()
    await stage("example.js", `${retained}\n${valid}`)
    await stageBaseline(retained)
    result = await runHook()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Cannot grow or edit")
    await git(["rm", "-f", "--", baselinePath])
    result = await runHook()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Missing staged")
  })

  test("allows notices, tool directives, public API JSDoc, and comment-like strings", async () => {
    await mkdir(join(repository, "src"))
    await stage(
      "src/example.js",
      '#!/usr/bin/env node\n// @ts-check\n// SPDX-License-Identifier: AGPL-3.0-only\n/** Example value. */\nexport const value = "// data"\n',
    )
    const result = await runHook()
    expect(result.status, result.stderr).toBe(0)
    await stage("example.js", `/** Internal documentation. */\n${valid}`)
    const rejected = await runHook()
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain("new or edited comment")
  })

  test.each([
    [
      "example.tsx",
      'export const node = <div>{"/* data */"}{/* JSX comment */}</div>\n',
      "/* JSX comment */",
    ],
    [
      "example.css",
      'p { content: "/* data */"; color: /* inside a value */ red; }\n',
      "/* inside a value */",
    ],
    [
      "example.html",
      '<template data-value="<!-- data -->"><!-- template comment --></template>\n',
      "<!-- template comment -->",
    ],
    ["example.sh", 'echo "😀 # data" # 你好\n', "# 你好"],
    ["example.yml", 'value: "# data" # YAML comment\n', "# YAML comment"],
    ["tsconfig.json", '{"extends":"// data" /* JSONC comment */}\n', "/* JSONC comment */"],
  ])(
    "parses comments in %s without mistaking data for source comments",
    async (path, source, comment) => {
      await stage(path, source)
      const result = await runHook()
      expect(result.status).toBe(1)
      expect(result.stderr.trimEnd()).toBe(
        `${JSON.stringify(path)}:1: new or edited comment ${JSON.stringify(comment)}`,
      )
    },
  )

  test("rejects invalid staged content even when the worktree is fixed", async () => {
    await stage("example.js", invalid)
    await writeFile(join(repository, "example.js"), valid)
    const result = await runHook()
    expect(result.status, result.stdout + result.stderr).toBe(1)
    expect(result.stdout + result.stderr).toContain("example.js")
  })

  test("accepts valid staged content despite unstaged edits and untracked errors", async () => {
    await stage("example.js", valid)
    await writeFile(join(repository, "example.js"), invalid)
    await writeFile(join(repository, "untracked.js"), invalid)
    const result = await runHook()
    expect(result.status, result.stdout + result.stderr).toBe(0)
  })

  test("uses staged configuration and ignore rules, not worktree copies", async () => {
    await stage("example.js", valid)
    await stage("ignored.js", invalid)
    await stage(".gitignore", "node_modules/\nignored.js\n")
    await writeFile(join(repository, ".gitignore"), "node_modules/\n")
    await writeFile(join(repository, "biome.json"), "not valid JSON")
    const result = await runHook()
    expect(result.status, result.stdout + result.stderr).toBe(0)
  })

  test("rejects a staged configuration error hidden by a valid worktree config", async () => {
    await stage("biome.json", "not valid JSON")
    await writeFile(join(repository, "biome.json"), config)
    const result = await runHook()
    expect(result.status, result.stdout + result.stderr).toBe(1)
  })

  test("handles spaces, tabs, newlines, and leading dashes in paths", async () => {
    const paths = ["space name.js", "tab\tname.js", "line\nname.js", "-option.js"]
    for (const path of paths) await stage(path, valid)
    let result = await runHook()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    for (const path of paths) {
      await stage(path, invalid)
      await writeFile(join(repository, path), valid)
      result = await runHook()
      expect(result.status, result.stdout + result.stderr).toBe(1)
      await stage(path, valid)
    }
  })

  test("checks rename destinations and omits staged deletions", async () => {
    await stage("old name.js", valid)
    await stage("deleted.js", invalid)
    await setHeadFromIndex()
    await rename(join(repository, "old name.js"), join(repository, "new\nname.js"))
    await git(["rm", "--", "deleted.js", "old name.js"])
    await git(["add", "--", "new\nname.js"])
    await writeFile(join(repository, "deleted.js"), invalid)
    let result = await runHook()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    await stage("new\nname.js", invalid)
    await writeFile(join(repository, "new\nname.js"), valid)
    result = await runHook()
    expect(result.status, result.stdout + result.stderr).toBe(1)
  })

  test("rejects staged file and directory symlinks without touching their targets", async () => {
    const external = join(temporary, "external")
    await mkdir(external)
    const target = join(external, "target.js")
    await writeFile(target, invalid)
    for (const [name, destination] of [
      ["linked.js", target],
      ["linked-directory", external],
    ]) {
      await symlink(destination, join(repository, name))
      await git(["add", "--", name])
      const result = await runHook()
      expect(result.status, result.stdout + result.stderr).toBe(1)
      expect(result.stderr).toContain("staged symlinks")
      expect(await readFile(target, "utf8")).toBe(invalid)
      await git(["rm", "-f", "--", name])
    }
  })

  test("does not execute staged scripts or checkout filters", async () => {
    const marker = join(temporary, "executed")
    await mkdir(join(repository, ".husky"))
    await stage(".husky/pre-commit", `#!/bin/sh\ntouch '${marker}'\n`)
    const stagedHelper = "scripts/check-comments.mjs"
    env.SKETCHBOOK_HOOK_TEST_MARKER = marker
    await stage(
      stagedHelper,
      'import { writeFileSync } from "node:fs"\n\nwriteFileSync(process.env.SKETCHBOOK_HOOK_TEST_MARKER, "")\n',
    )
    await copyFile(join(root, stagedHelper), join(repository, stagedHelper))
    await stage(
      "package.json",
      `${JSON.stringify({ scripts: { prepare: `touch '${marker}'`, precommit: `touch '${marker}'` } }, null, 2)}\n`,
    )
    await stage(".gitattributes", "*.js filter=unsafe\n")
    await git(["config", "filter.unsafe.smudge", `touch '${marker}'`])
    await stage("example.js", valid)
    const result = await runHook()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    await expect(lstat(marker)).rejects.toMatchObject({ code: "ENOENT" })
  })
})
