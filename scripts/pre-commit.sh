#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
biome="$(pwd -P)/node_modules/.bin/biome"
snapshot=$(mktemp -d "${TMPDIR:-/tmp}/sketchbook-pre-commit.XXXXXX")
trap 'rm -rf "$snapshot"' 0
trap 'exit 1' HUP INT TERM

node ./scripts/staged-snapshot.mjs "$snapshot"
cd "$snapshot"
"$biome" ci . --config-path=.
