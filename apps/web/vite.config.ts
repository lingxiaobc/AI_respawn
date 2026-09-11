import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { loadLocalEnv } from "../../scripts/env.ts";
import { resolve } from "node:path";
import { assertPrivateStorage } from "../server/src/storage-safety.ts";

await loadLocalEnv();
assertPrivateStorage(process.env.AVATAR_STORAGE_DIR ?? "artifacts/avatars");
const gateway = `127.0.0.1:${process.env.PORT ?? "8877"}`;

export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: {
      strict: true,
      // Do not expose private SQLite/photos via Vite's /@fs endpoint.
      allow: ["apps/web", "packages/audio", "packages/avatar", "packages/protocol", "node_modules"].map(p => resolve(p)),
      deny: ["**/.env", "**/.env.*", "**/*.{crt,pem,key}", "**/.git/**", "**/artifacts/**", "**/logs/**", "**/TASK/**", "**/output/**", "**/*.sqlite*",
        `${resolve(process.env.AVATAR_STORAGE_DIR ?? "artifacts/avatars").replaceAll("\\", "/")}/**`],
    },
    proxy: { "/ws": { target: `ws://${gateway}`, ws: true }, "/api": `http://${gateway}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
