#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

# Use the installed tool, never an executable from the staged snapshot.
biome="$(pwd -P)/node_modules/.bin/biome"
snapshot=$(mktemp -d "${TMPDIR:-/tmp}/sketchbook-pre-commit.XXXXXX")
trap 'rm -rf "$snapshot"' 0
trap 'exit 1' HUP INT TERM

node - "$snapshot" <<'NODE'
const { execFileSync } = require("node:child_process")
const { closeSync, mkdirSync, openSync, realpathSync } = require("node:fs")

const root = Buffer.from(`${realpathSync(process.argv[2])}/`)
const git = (args, options = {}) =>
  execFileSync("git", ["-c", "core.fsmonitor=false", ...args], options)
const index = git(["ls-files", "--stage", "-z"])
const entries = []

// Keep paths as bytes: Git filenames can contain tabs, newlines, or non-UTF-8 bytes.
for (let start = 0; start < index.length;) {
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
    // Read raw blobs. A checkout can apply filters and change the staged content.
    git(["cat-file", "blob", oid], { stdio: ["ignore", fd, "inherit"] })
  } finally {
    closeSync(fd)
  }
}
NODE

cd "$snapshot"
"$biome" ci . --config-path=.
