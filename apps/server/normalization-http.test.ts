import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { NORMALIZATION_CONTRACT } from "../../packages/image-normalization/src/contract.ts";
import { NormalizationQueue } from "../../packages/image-normalization/src/queue.ts";
import type { ImageNormalizationProvider } from "../../packages/image-normalization/src/types.ts";
import { handleNormalizationHttp } from "./src/normalization-http.ts";

test("normalization HTTP API submits, lists, and serves local assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "normalization-http-"));
  const canonicalCanvas = createCanvas(1024, 1536);
  canonicalCanvas.getContext("2d").fillRect(0, 0, 1024, 1536);
  const canonical = await canonicalCanvas.encode("png");
  const sourceCanvas = createCanvas(640, 900);
  sourceCanvas.getContext("2d").fillRect(0, 0, 640, 900);
  const source = await sourceCanvas.encode("png");
  const provider: ImageNormalizationProvider = {
    async normalize() { return { bytes: canonical, model: NORMALIZATION_CONTRACT.model }; },
  };
  const queue = new NormalizationQueue({ root, provider });
  await queue.initialize();
  const server = createServer((request, response) => {
    void handleNormalizationHttp(
      request,
      response,
      queue,
      (incoming) => incoming.headers.origin === "http://127.0.0.1:5173",
    ).then((handled) => { if (!handled) response.writeHead(404).end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const rejected = await fetch(`${base}/api/normalization/jobs`, { headers: { origin: "https://example.com" } });
    assert.equal(rejected.status, 403);
    const submitted = await fetch(`${base}/api/normalization/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
      body: JSON.stringify({ files: [{ name: "测试.png", type: "image/png", dataBase64: source.toString("base64") }] }),
    });
    assert.equal(submitted.status, 202);
    const created = await submitted.json() as { jobs: Array<{ id: string }> };
    const job = await queue.waitFor(created.jobs[0]!.id);
    assert.equal(job.status, "succeeded");
    const listed = await (await fetch(`${base}/api/normalization/jobs`)).json() as { jobs: Array<{ id: string }> };
    assert.equal(listed.jobs.some((item) => item.id === job.id), true);
    const asset = await fetch(`${base}${job.canonicalUrl}`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), canonical);
    assert.equal((await fetch(`${base}/api/normalization/assets/..%2Fsecret/source`)).status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
