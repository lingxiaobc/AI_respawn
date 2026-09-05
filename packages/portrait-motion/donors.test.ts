import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { ZenMuxImageProvider } from "../image-normalization/src/zenmux.ts";
import { CALL_LIMIT, DONOR_STATES, donorPrompt, donorPromptVersion, generateDonors, reserveCall, withCallLock } from "./src/donors.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "portrait-motion-test-"));
  const directory = join(root, "portrait");
  await mkdir(directory);
  const canvas = createCanvas(1024, 1536);
  const context = canvas.getContext("2d");
  context.fillStyle = "#a48866"; context.fillRect(0, 0, 1024, 1536);
  const bytes = await canvas.encode("png");
  await writeFile(join(directory, "static_locked_base.png"), bytes);
  await writeFile(join(directory, "landmarks.json"), JSON.stringify({ sourceHash: createHash("sha256").update(bytes).digest("hex") }));
  return { root, directory, bytes };
}

test("independent half-state prompts and one-output supplier contract", () => {
  assert.equal(DONOR_STATES.length, 4);
  assert.notEqual(donorPrompt("mouth-half"), donorPrompt("mouth-open"));
  assert.match(donorPrompt("eyes-half"), /halfway/);
  assert.match(donorPrompt("eyes-closed"), /No visible iris/);
});

test("approved mouth standard has distinct targets and preserves eye prompt versions", () => {
  assert.match(donorPrompt("mouth-half"), /Generate ONLY the HALF-OPEN state.*target 0\.10, range 0\.08-0\.12/);
  assert.match(donorPrompt("mouth-open"), /Generate ONLY the MAXIMUM OPEN state.*target 0\.22, range 0\.20-0\.24/);
  assert.match(donorPrompt("mouth-open"), /at least 0\.08 W taller/);
  assert.match(donorPrompt("mouth-half"), /INNER edges/);
  assert.match(donorPrompt("mouth-half"), /no teeth or oral gap/);
  assert.equal(donorPromptVersion("mouth-half"), "local-donor-v2");
  assert.equal(donorPromptVersion("eyes-half"), "local-donor-v1");
});

test("a changed prompt cannot silently regenerate a previous attempt", async () => {
  const { root, directory } = await fixture();
  const { sourceHash } = JSON.parse(await readFile(join(directory, "landmarks.json"), "utf8"));
  await reserveCall(root, "old-prompt-attempt", { sourceHash, state: "mouth-half", promptVersion: "local-donor-v1" });
  let calls = 0;
  const provider = new ZenMuxImageProvider({ apiKey: "test-only", fetchImpl: async () => {
    calls++; throw new Error("must not call");
  } });
  await assert.rejects(generateDonors(directory, root, provider), /explicit regeneration approval/);
  assert.equal(calls, 0);
  assert.equal((await readdir(join(root, ".calls"))).length, 1);
});

test("four successes are cached and do not call supplier twice", async () => {
  const { root, directory, bytes } = await fixture();
  let calls = 0;
  const provider = new ZenMuxImageProvider({ apiKey: "test-only", fetchImpl: async (_url, init) => {
    calls++;
    const form = init!.body as FormData;
    assert.equal(form.get("n"), "1");
    assert.equal(form.get("model"), "openai/gpt-image-2");
    return Response.json({ data: [{ b64_json: bytes.toString("base64") }] });
  } });
  await generateDonors(directory, root, provider);
  await generateDonors(directory, root, provider);
  assert.equal(calls, 4);
  assert.equal((await readdir(join(root, ".calls"))).length, 4);
});

test("unknown network completion is charged to budget and never retried", async () => {
  const { root, directory } = await fixture();
  let calls = 0;
  const provider = new ZenMuxImageProvider({ apiKey: "test-only", fetchImpl: async () => {
    calls++; throw new Error("fetch failed");
  } });
  await assert.rejects(generateDonors(directory, root, provider), /fetch failed/);
  await assert.rejects(generateDonors(directory, root, provider), /automatic retry is prohibited/);
  assert.equal(calls, 1);
  const entries = await readdir(join(root, ".calls"));
  assert.equal(entries.length, 1);
  assert.equal(JSON.parse(await readFile(join(root, ".calls", entries[0]!), "utf8")).status, "failed-or-unknown");
});

test("reserved crash state blocks supplier and cross-process lock prevents races", async () => {
  const { root } = await fixture();
  await withCallLock(root, async () => {
    await assert.rejects(withCallLock(root, async () => {}), /lock exists/);
    await reserveCall(root, "interrupted", { state: "mouth-half" });
    await assert.rejects(reserveCall(root, "interrupted", {}), /EEXIST/);
  });
  assert.equal(JSON.parse(await readFile(join(root, ".calls/interrupted.json"), "utf8")).status, "reserved");
});

test("approval budget refuses an attempt beyond the configured limit", async () => {
  const { root } = await fixture();
  await withCallLock(root, async () => {
    for (let i = 0; i < CALL_LIMIT; i++) await reserveCall(root, `attempt-${i}`, {});
    await assert.rejects(reserveCall(root, "excess", {}), /budget exhausted/);
  });
});

test("supplier errors cannot echo the configured credential into ledger", async () => {
  const { root, directory } = await fixture();
  const secret = "SYNTHETIC_SECRET_123";
  const provider = new ZenMuxImageProvider({ apiKey: secret, fetchImpl: async () => Response.json({
    error: { message: `authorization: Bearer ${secret}; bare token ${secret}` },
  }, { status: 400 }) });
  await assert.rejects(generateDonors(directory, root, provider), (error: Error) => {
    assert.ok(!error.message.includes(secret));
    return true;
  });
  const entries = await readdir(join(root, ".calls"));
  assert.ok(!(await readFile(join(root, ".calls", entries[0]!), "utf8")).includes(secret));
});

test("corrupted cached output is blocked without another supplier call", async () => {
  const { root, directory, bytes } = await fixture();
  let calls = 0;
  const provider = new ZenMuxImageProvider({ apiKey: "test-only", fetchImpl: async () => {
    calls++;
    return Response.json({ data: [{ b64_json: bytes.toString("base64") }] });
  } });
  await generateDonors(directory, root, provider);
  await writeFile(join(directory, "donors/mouth-half.png"), "corrupted");
  await assert.rejects(generateDonors(directory, root, provider), /automatic retry is prohibited/);
  assert.equal(calls, 4);
});
