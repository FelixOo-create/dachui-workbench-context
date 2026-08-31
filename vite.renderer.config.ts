import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5178,
    strictPort: true,
    watch: { ignored: ["**/.qa-*/**", "**/release/**"] },
  },
  build: { outDir: ".vite/renderer/main_window", emptyOutDir: true },
});
