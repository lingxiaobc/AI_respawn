import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { NORMALIZATION_CONTRACT } from "./src/contract.ts";
import { NormalizationQueue } from "./src/queue.ts";
import type { ImageNormalizationProvider } from "./src/types.ts";
import { InputValidationError, sanitizeProviderError, validateAndConvertInput } from "./src/validation.ts";
import { ZenMuxImageProvider } from "./src/zenmux.ts";

async function testPng(width = 640, height = 900): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#a78b71";
  context.fillRect(0, 0, width, height);
  return canvas.encode("png");
}

test("input validation detects content and converts accepted images to PNG", async () => {
  const canvas = createCanvas(700, 800);
  canvas.getContext("2d").fillRect(0, 0, 700, 800);
  const jpeg = await canvas.encode("jpeg");
  const image = await validateAndConvertInput({ fileName: "portrait.jpg", mimeType: "image/jpeg", bytes: jpeg });
  assert.equal(image.mimeType, "image/jpeg");
  assert.equal(image.width, 700);
  assert.equal(image.height, 800);
  assert.equal((await loadImage(image.pngBytes)).width, 700);
  await assert.rejects(
    validateAndConvertInput({ fileName: "tiny.png", mimeType: "image/png", bytes: await testPng(200, 300) }),
    InputValidationError,
  );
});

test("provider sends the frozen ZenMux image-edit contract and reads Base64 output", async () => {
  const canonical = await testPng(NORMALIZATION_CONTRACT.width, NORMALIZATION_CONTRACT.height);
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const provider = new ZenMuxImageProvider({
    apiKey: "test-secret-never-log",
    fetchImpl: (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ data: [{ b64_json: canonical.toString("base64") }], model: "openai/gpt-image-2" }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req-test" },
      });
    }) as typeof fetch,
  });
  const source = await validateAndConvertInput({ fileName: "person.png", mimeType: "image/png", bytes: await testPng() });
  const result = await provider.normalize(source);
  assert.equal(capturedUrl, "https://zenmux.ai/api/v1/images/edits");
  const form = capturedInit?.body as FormData;
  assert.equal(form.get("model"), NORMALIZATION_CONTRACT.model);
  assert.equal(form.get("input_fidelity"), "high");
  assert.equal(form.get("quality"), "high");
  assert.equal(form.get("size"), "1024x1536");
  assert.equal(form.get("n"), "1");
  assert.equal(result.requestId, "req-test");
  assert.deepEqual(result.bytes, canonical);
});

test("queue is sequential, persists outputs, and skips a successful duplicate", async () => {
  const root = await mkdtemp(join(tmpdir(), "normalization-queue-"));
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  const provider: ImageNormalizationProvider = {
    async normalize() {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return {
        bytes: await testPng(NORMALIZATION_CONTRACT.width, NORMALIZATION_CONTRACT.height),
        requestId: `req-${calls}`,
        model: NORMALIZATION_CONTRACT.model,
      };
    },
  };
  try {
    const queue = new NormalizationQueue({ root, provider });
    await queue.initialize();
    const bytesA = await testPng(640, 900);
    const bytesB = await testPng(700, 900);
    const first = await queue.submit({ fileName: "第一张.png", mimeType: "image/png", bytes: bytesA });
    const second = await queue.submit({ fileName: "second.png", mimeType: "image/png", bytes: bytesB });
    assert.equal((await queue.waitFor(first.id)).status, "succeeded");
    assert.equal((await queue.waitFor(second.id)).status, "succeeded");
    assert.equal(maximumActive, 1);
    const duplicate = await queue.submit({ fileName: "第一张.png", mimeType: "image/png", bytes: bytesA });
    assert.equal(duplicate.status, "skipped");
    assert.equal(calls, 2);
    const metadata = JSON.parse(await readFile(join(root, first.outputKey, "metadata.json"), "utf8")) as Record<string, unknown>;
    assert.equal(metadata.status, "succeeded");
    assert.equal("apiKey" in metadata, false);
    assert.equal((await loadImage(join(root, first.outputKey, "canonical.png"))).width, 1024);
    await writeFile(join(root, first.outputKey, "canonical.png"), "corrupt cached image");
    await assert.rejects(queue.submit({ fileName: "第一张.png", mimeType: "image/png", bytes: bytesA }), /CANONICAL_CACHE_INVALID/);
    assert.equal(calls, 2, "corrupt legacy cache must not trigger a new provider call");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider errors are bounded and redact credentials and binary payloads", () => {
  const sanitized = sanitizeProviderError(`Authorization=secret ${"A".repeat(200)}`);
  assert.equal(sanitized.includes("secret"), false);
  assert.equal(sanitized.includes("A".repeat(100)), false);
  assert.ok(sanitized.length <= 500);
});
