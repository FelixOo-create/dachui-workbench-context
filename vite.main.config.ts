import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: "undefined",
    MAIN_WINDOW_VITE_NAME: JSON.stringify("main_window"),
  },
  build: {
    sourcemap: true,
    minify: false,
    emptyOutDir: false,
    outDir: ".vite/build",
    lib: { entry: resolve("src/main/main.ts"), formats: ["cjs"], fileName: () => "main.js" },
    rollupOptions: { external: ["electron", ...builtinModules, ...builtinModules.map((name) => "node:" + name), "node:sqlite"] },
  },
});
