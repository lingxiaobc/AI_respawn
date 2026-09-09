import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadLocalEnv } from "../../scripts/env.ts";

await loadLocalEnv();
const gateway = `127.0.0.1:${process.env.PORT ?? "8877"}`;

export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/ws": { target: `ws://${gateway}`, ws: true }, "/api": `http://${gateway}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
