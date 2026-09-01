import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const live2dSdkRoot = resolve(process.env.LIVE2D_SDK_PATH ?? "P:/live2D/CubismSdkForWeb-5-r.5");
const portraitRoot = resolve(projectRoot, "AI_output/live2d/runtime/portrait");
const frameworkRoot = resolve(live2dSdkRoot, "Framework/src");
const shaderRoot = resolve(live2dSdkRoot, "Framework/Shaders/WebGL");
const corePath = resolve(live2dSdkRoot, "Core/live2dcubismcore.min.js");

const mimeTypes: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".moc3": "application/octet-stream",
  ".png": "image/png",
  ".vert": "text/plain; charset=utf-8",
  ".frag": "text/plain; charset=utf-8",
};

function filesBelow(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function live2dAssets(): Plugin {
  const assets = new Map<string, string>([
    ["live2d/core/live2dcubismcore.min.js", corePath],
    ...filesBelow(shaderRoot).map((path) => [
      `live2d/shaders/${relative(shaderRoot, path).split(sep).join("/")}`,
      path,
    ] as const),
    ...filesBelow(portraitRoot)
      .filter((path) => [".json", ".moc3", ".png"].includes(extname(path).toLowerCase()))
      .map((path) => [
        `live2d/models/portrait/${relative(portraitRoot, path).split(sep).join("/")}`,
        path,
      ] as const),
  ]);

  return {
    name: "local-live2d-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const key = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).slice(1);
        const source = assets.get(key);
        if (!source) return next();
        response.statusCode = 200;
        response.setHeader("Content-Type", mimeTypes[extname(source).toLowerCase()] ?? "application/octet-stream");
        response.setHeader("Content-Length", String(statSync(source).size));
        response.end(readFileSync(source));
      });
    },
    generateBundle() {
      for (const [fileName, source] of assets) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(source) });
      }
    },
  };
}

export default defineConfig({
  root: "apps/web",
  plugins: [react(), live2dAssets()],
  resolve: { alias: { "@live2d-framework": frameworkRoot } },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [projectRoot, live2dSdkRoot] },
    proxy: { "/ws": { target: "ws://127.0.0.1:8787", ws: true } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
