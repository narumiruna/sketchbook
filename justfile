# Install dependencies, build the Viewer, and serve the diagram atlas.
demo:
    npm ci --include=dev
    npm exec --no -- vite build
    @exec node --import tsx scripts/demo.ts
