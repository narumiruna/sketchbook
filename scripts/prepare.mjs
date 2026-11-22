import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))

if (!existsSync(join(root, "node_modules/vite/package.json"))) {
  const npm = process.env.npm_execpath
  if (!npm) throw new Error("Run the Sketchbook prepare script through npm")

  const build = await mkdtemp(join(tmpdir(), "sketchbook-build-"))
  try {
    for (const path of [
      "package.json",
      "package-lock.json",
      "src",
      "tsconfig.json",
      "tsconfig.web.json",
      "vite.config.ts",
      "scripts/bundle-diagram-design.mjs",
    ]) {
      await cp(join(root, path), join(build, path), { recursive: true })
    }
    const options = { cwd: build, stdio: "inherit" }
    execFileSync(
      process.execPath,
      [npm, "ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
      options,
    )
    execFileSync(process.execPath, [npm, "run", "build"], options)
    for (const path of ["dist", "skills/sketchbook/upstream"]) {
      await rm(join(root, path), { recursive: true, force: true })
      await cp(join(build, path), join(root, path), { recursive: true })
    }
  } finally {
    await rm(build, { recursive: true, force: true })
  }
}
