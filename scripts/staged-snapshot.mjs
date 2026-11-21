import { execFileSync, spawnSync } from "node:child_process"
import { closeSync, mkdirSync, openSync, readFileSync, realpathSync } from "node:fs"
import { baselinePath, checkComments } from "./check-comments.mjs"

const root = Buffer.from(`${realpathSync(process.argv[2])}/`)
const gitArgs = (args) => ["-c", "core.fsmonitor=false", ...args]
const git = (args, options) => execFileSync("git", gitArgs(args), options)

function headBaseline() {
  const head = spawnSync("git", gitArgs(["rev-parse", "--verify", "--quiet", "HEAD"]), {
    encoding: "utf8",
  })
  if (head.status === 1) return undefined
  if (head.status !== 0) throw head.error ?? new Error(`Cannot resolve HEAD: ${head.stderr}`)
  const commit = head.stdout.trim()
  if (git(["ls-tree", "-z", commit, "--", baselinePath]).length === 0) return undefined
  return git(["cat-file", "blob", `${commit}:${baselinePath}`], { encoding: "utf8" })
}

const index = git(["ls-files", "--stage", "-z"])
const entries = []
for (let start = 0; start < index.length; ) {
  const end = index.indexOf(0, start)
  const tab = index.indexOf(9, start)
  const [mode, oid, stage] = index.subarray(start, tab).toString().split(" ")
  const path = index.subarray(tab + 1, end)
  if (stage !== "0" || !["100644", "100755"].includes(mode)) {
    throw new Error("Cannot validate staged symlinks, submodules, or unresolved conflicts")
  }
  const parts = path.toString().split("/")
  if (parts.some((part) => !part || [".", "..", ".git"].includes(part.toLowerCase()))) {
    throw new Error("Unsafe staged path")
  }
  entries.push({ oid, path })
  start = end + 1
}

for (const { oid, path } of entries) {
  const destination = Buffer.concat([root, path])
  mkdirSync(destination.subarray(0, destination.lastIndexOf(47)), { recursive: true })
  const fd = openSync(destination, "wx")
  try {
    git(["cat-file", "blob", oid], { stdio: ["ignore", fd, "inherit"] })
  } finally {
    closeSync(fd)
  }
}

const read = (path) => readFileSync(Buffer.concat([root, path]), "utf8")
try {
  checkComments(
    entries.map(({ path }) => path),
    read,
    headBaseline(),
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
