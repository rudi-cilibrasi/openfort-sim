import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", port: 5173 },
  build: {
    // The three chunk is three.js's WebGL renderer and the classes world.js
    // imports (about 550 kB); it is cached on its own, apart from the app.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
          if (
            id.includes("node_modules/@codemirror/") ||
            id.includes("node_modules/codemirror/") ||
            id.includes("node_modules/@lezer/")
          )
            return "editor";
        },
      },
    },
  },
});
