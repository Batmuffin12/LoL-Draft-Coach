import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  // Dev aid (pnpm perf): React's profiling build, so <Profiler> reports commit times.
  resolve: process.env.LDC_PERF_PROFILING === "1" ? { alias: { "react-dom/client": "react-dom/profiling" } } : {},
  build: { outDir: "../../dist/renderer", emptyOutDir: true },
});
