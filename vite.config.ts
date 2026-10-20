import { defineConfig } from "vite";

// Tauri serves the built files itself; in dev it points at this port.
export default defineConfig({
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
