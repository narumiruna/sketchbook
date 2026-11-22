import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const fontPackages = [
  "@fontsource/instrument-serif",
  "@fontsource-variable/geist",
  "@fontsource-variable/geist-mono",
  "@fontsource-variable/noto-sans-tc",
  "@fontsource-variable/noto-serif-tc",
]

export default defineConfig({
  plugins: [
    {
      name: "editorial-font-notices",
      async generateBundle() {
        const notices = await Promise.all(
          fontPackages.map(async (name) => {
            const source = await readFile(
              new URL(`./node_modules/${name}/LICENSE`, import.meta.url),
              "utf8",
            )
            return `## ${name}\n\n${source.trim()}`
          }),
        )
        this.emitFile({
          type: "asset",
          fileName: "EDITORIAL_FONT_LICENSES.md",
          source: `${notices.join("\n\n")}\n`,
        })
      },
    },
  ],
  root: fileURLToPath(new URL("./src/web", import.meta.url)),
  base: "./",
  esbuild: { jsx: "automatic" },
  build: {
    outDir: fileURLToPath(new URL("./dist/web", import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: (path) => (path.includes("@fontsource") ? false : undefined),
    license: { fileName: "THIRD_PARTY_LICENSES.md" },
  },
})
