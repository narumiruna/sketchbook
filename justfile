# Build the Viewer and serve the two-volume diagram atlas.
demo:
    npm exec --no -- vite build
    @exec node --import tsx scripts/demo.ts
