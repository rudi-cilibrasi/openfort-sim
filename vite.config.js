import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", port: 5173 },
  build: {
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
