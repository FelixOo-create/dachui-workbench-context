import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    outDir: ".vite/build",
    lib: { entry: resolve("src/preload/preload.ts"), formats: ["cjs"], fileName: () => "preload.js" },
    rollupOptions: { external: ["electron", ...builtinModules, ...builtinModules.map((name) => "node:" + name), "node:sqlite"] },
  },
});
