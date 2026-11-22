import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const revision = "d74d8c2d0c78a9e1efd43137f6a9a51182a8b5f0"
const checksum = "93f6634f9a1be43d6c70417e0d85c687b9e34d3f044660a9a3fce613c82524b9"
const prefix = `diagram-design-${revision}`
const bundle = fileURLToPath(new URL("../skills/sketchbook/upstream/", import.meta.url))
const scratch = await mkdtemp(join(tmpdir(), "sketchbook-upstream-"))
try {
  const response = await fetch(
    `https://codeload.github.com/cathrynlavery/diagram-design/tar.gz/${revision}`,
    {
      signal: AbortSignal.timeout(60_000),
    },
  )
  if (!response.ok)
    throw new Error(`Could not download pinned Diagram Design source: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (createHash("sha256").update(bytes).digest("hex") !== checksum) {
    throw new Error("Diagram Design archive checksum does not match the pinned source")
  }
  const archive = join(scratch, "source.tgz")
  await writeFile(archive, bytes)
  const notices = ["LICENSE", "THIRD_PARTY_LICENSES.md"]
  const skill = join(prefix, "skills", "diagram-design")
  execFileSync("tar", [
    "-xzf",
    archive,
    "-C",
    scratch,
    ...notices.map((file) => `${prefix}/${file}`),
    skill.replaceAll("\\", "/"),
  ])
  const staged = join(scratch, skill)
  await rename(join(staged, "SKILL.md"), join(staged, "GUIDE.md"))
  for (const name of notices) await cp(join(scratch, prefix, name), join(staged, name))
  await rm(bundle, { force: true, recursive: true })
  await mkdir(bundle, { recursive: true })
  await cp(staged, bundle, { recursive: true })
} finally {
  await rm(scratch, { force: true, recursive: true })
}
