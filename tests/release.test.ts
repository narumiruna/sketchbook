import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

const execute = promisify(execFile)
const root = fileURLToPath(new URL("../", import.meta.url))
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"))

test("keeps automatic GitHub releases without npm publishing configuration", async () => {
  const workflow = await readFile(join(root, ".github/workflows/release.yml"), "utf8")
  expect(manifest.scripts.release).toBe("npm run build && changeset git-tag")
  expect(workflow).toContain("  workflow_dispatch:")
  expect(workflow).toContain("  push:\n    branches:\n      - main")
  expect(workflow).toContain("publish-script: npm run release")
  expect(workflow).toContain("create-github-releases: true")
  expect(workflow).not.toContain("registry-url:")
  expect(workflow).not.toContain("id-token:")
})

describe("GitHub-only release", () => {
  let temporary: string
  let output: string
  let env: NodeJS.ProcessEnv
  let fixture: { name: string; version: string; scripts: { release: string; build: string } }

  beforeEach(async () => {
    temporary = await mkdtemp(join(tmpdir(), "pi-sketchbook-release-"))
    output = join(temporary, "changesets-output.ndjson")
    env = {
      ...process.env,
      CHANGESETS_OUTPUT: output,
      npm_config_registry: "http://127.0.0.1:9",
      GIT_AUTHOR_NAME: "Release test",
      GIT_AUTHOR_EMAIL: "release-test@example.invalid",
      GIT_COMMITTER_NAME: "Release test",
      GIT_COMMITTER_EMAIL: "release-test@example.invalid",
    }
    fixture = {
      name: manifest.name,
      version: manifest.version,
      scripts: {
        release: manifest.scripts.release,
        build: "node -e \"require('node:fs').writeFileSync('build-complete', '')\"",
      },
    }
    await mkdir(join(temporary, ".changeset"))
    await writeFile(join(temporary, "package.json"), JSON.stringify(fixture))
    await writeFile(
      join(temporary, ".changeset/config.json"),
      await readFile(join(root, ".changeset/config.json")),
    )
    await symlink(join(root, "node_modules"), join(temporary, "node_modules"), "dir")
    await execute("git", ["init", "-b", "main"], { cwd: temporary, env })
    await execute("git", ["add", "package.json", ".changeset/config.json"], {
      cwd: temporary,
      env,
    })
    await execute("git", ["commit", "-m", "test: prepare release fixture"], {
      cwd: temporary,
      env,
    })
  })

  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true })
  })

  test("builds and emits GitHub release events only for new tags", async () => {
    expect(manifest.scripts.release).toBe("npm run build && changeset git-tag")
    const options = { cwd: temporary, env, timeout: 10_000 }
    await execute("npm", ["run", "release"], options)
    expect(await readFile(join(temporary, "build-complete"), "utf8")).toBe("")
    const events = (await readFile(output, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(events).toEqual([
      { type: "git-tag", tag: `v${manifest.version}`, packageName: manifest.name },
    ])
    expect((await execute("git", ["tag", "--list"], options)).stdout.trim()).toBe(
      `v${manifest.version}`,
    )

    await writeFile(output, "")
    await execute("npm", ["run", "release"], options)
    expect(await readFile(output, "utf8")).toBe("")
    expect((await execute("git", ["tag", "--list"], options)).stdout.trim()).toBe(
      `v${manifest.version}`,
    )
  }, 30_000)

  test("does not create tags when the build fails", async () => {
    fixture.scripts.build = 'node -e "process.exit(1)"'
    await writeFile(join(temporary, "package.json"), JSON.stringify(fixture))
    const options = { cwd: temporary, env, timeout: 10_000 }
    await expect(execute("npm", ["run", "release"], options)).rejects.toMatchObject({ code: 1 })
    expect((await execute("git", ["tag", "--list"], options)).stdout).toBe("")
    await expect(readFile(output, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })
})
