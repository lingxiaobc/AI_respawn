import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, writeFile, rmdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { ZenMuxImageProvider } from "../../image-normalization/src/zenmux.ts";
import { validateAndConvertInput, sanitizeProviderError } from "../../image-normalization/src/validation.ts";

export const DONOR_STATES = ["mouth-half", "mouth-open", "eyes-half", "eyes-closed"] as const;
export type DonorState = typeof DONOR_STATES[number];
// PT-new-role-stability v1: user approved 14 historical + at most 25 first attempts.
export const CALL_LIMIT = 40; // One extra attempt explicitly approved for new-role coverage on 2026-09-05.
// Reconcile the explicitly approved manual success; never issue this retry again.
const APPROVED_REPLACEMENT = "674a3f21bfb0095fcc53a8429a48aa515b0a589f66895b6fad37239dd5d74302";
export const PROMPT_VERSION = "local-donor-v2";
// Eye prompts are unchanged; keep their existing cache identities.
export function donorPromptVersion(state: DonorState): string {
  return state.startsWith("mouth-") ? PROMPT_VERSION : "local-donor-v1";
}
const mouthStandard = "Mouth-opening standard: W is the original reference distance between the two mouth corners. H is the central gap between the INNER edges of the upper and lower lips, measured perpendicular to the mouth-corner line; do not include lip thickness, and visible teeth still count inside this gap. The three anchor states are naturally closed (H/W approximately 0, inner lip edges gently touching, no teeth or oral gap, relaxed not pursed, subtly friendly), half-open (target H/W 0.10, range 0.08-0.12), and maximum relaxed speech opening (target H/W 0.22, range 0.20-0.24). Keep the SAME original W in all states. Maximum opening must be clearly about twice the half-open gap, not merely show more teeth. Preserve original lip thickness, cupid's bow, asymmetry and skin texture. Keep mouth corners anchored; no horizontal stretching, no jaw/chin movement, no shouting, yawning, surprised expression, round O-shaped phoneme or broad grin. Use plausible subtle teeth and oral depth, not an all-white tooth strip or a featureless black hole.";
const descriptions: Record<DonorState, string> = {
  "mouth-half": `${mouthStandard}\nGenerate ONLY the HALF-OPEN state (parameter 0.5): H/W target 0.10, range 0.08-0.12. Change ONLY the lips and mouth interior. Show a clearly visible but relaxed speaking gap, larger than a tiny slit and distinctly smaller than the maximum state. Do not reproduce the reference's original opening if it differs from this target.`,
  "mouth-open": `${mouthStandard}\nGenerate ONLY the MAXIMUM OPEN state (parameter 1): H/W target 0.22, range 0.20-0.24. Change ONLY the lips and mouth interior. Show a clearly larger, gently oval speaking opening, at least 0.08 W taller than the half-open anchor. This must NOT look like the half-open state or a slight parting of the lips. Do not reproduce the reference's original opening if it differs from this target.`,
  "eyes-half": "Change ONLY both upper eyelids: lower them halfway through a natural blink, leave approximately half the original visible eye height. The irises are partially occluded, gaze stays fixed. Keep lower lids, eye corners, eyebrows and mouth unchanged. Not a squint, no cheek movement.",
  "eyes-closed": "Change ONLY both upper eyelids: eyes fully and gently closed in a natural blink, upper eyelids meet lower eyelids. No visible iris, pupil or white of the eye. Preserve original eyelid creases, eyelashes and age. Keep eye corners, eyebrows, cheeks and mouth unchanged. Not a squint, no facial tension.",
};

export function donorPrompt(state: DonorState): string {
  return `Use case: identity-preserve, local portrait animation donor.\nInput image: edit target, immutable geometry reference.\n${descriptions[state]}\nKeep exact canvas 1024x1536, framing, head tilt, identity, age, pores, wrinkles, skin tone, hair, nose, clothing, background and lighting. No beauty retouch, no younger face. Preserve every other region. Output one photorealistic full-canvas image, no montage, text, labels, masks or transparency.`;
}

// Cross-process lock: a crash deliberately leaves the lock behind. An operator must
// reconcile ledger entries before removing it; a restart never guesses/retries.
export async function withCallLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(root, { recursive: true });
  const lock = join(root, ".paid-call-lock");
  try { await mkdir(lock); }
  catch { throw new Error("Paid-call lock exists; another worker or interrupted call needs reconciliation"); }
  try { return await operation(); }
  finally { await rmdir(lock); }
}

export async function reserveCall(root: string, id: string, details: object): Promise<string> {
  const directory = join(root, ".calls");
  await mkdir(directory, { recursive: true });
  if ((await readdir(directory)).filter((name) => name.endsWith(".json")).length >= CALL_LIMIT) {
    throw new Error(`${CALL_LIMIT}-call approval budget exhausted; new approval required`);
  }
  const path = join(directory, `${id}.json`);
  const file = await open(path, "wx");
  try {
    await file.writeFile(JSON.stringify({ ...details, status: "reserved", startedAt: new Date().toISOString() }, null, 2));
    await file.sync();
  } finally { await file.close(); }
  return path;
}

export async function generateDonors(directory: string, root: string, provider: ZenMuxImageProvider,
  progress: (state: string) => void = () => {},
  options: { approvedPromptUpgrade?: boolean } = {}): Promise<void> {
  directory = resolve(directory);
  const contract = JSON.parse(await readFile(join(directory, "landmarks.json"), "utf8"));
  const input = await validateAndConvertInput({ fileName: "canonical.png", bytes: await readFile(join(directory, "static_locked_base.png")) });
  if (input.sourceHash !== contract.sourceHash) throw new Error("Immutable base hash mismatch");
  await mkdir(join(directory, "donors"), { recursive: true });
  for (const state of DONOR_STATES) {
    await withCallLock(root, async () => {
      const promptVersion = donorPromptVersion(state);
      const originalId = createHash("sha256").update(`${input.sourceHash}:${promptVersion}:${state}`).digest("hex");
      const id = originalId === APPROVED_REPLACEMENT ? `${originalId}-approved-replacement-3` : originalId;
      const output = join(directory, "donors", `${state}.png`);
      const ledger = join(root, ".calls", `${id}.json`);
      const existing = await readFile(ledger, "utf8").catch((e) => { if (e.code === "ENOENT") return undefined; throw e; });
      if (existing) {
        const entry = JSON.parse(existing);
        const bytes = await readFile(output).catch(() => undefined);
        if (entry.status === "succeeded" && bytes && createHash("sha256").update(bytes).digest("hex") === entry.outputHash) {
          progress(`${state}:cached`); return;
        }
        throw new Error(`${state}: prior call exists without verified output; automatic retry is prohibited`);
      }
      if (originalId === APPROVED_REPLACEMENT) {
        throw new Error("Approved manual success ledger missing; automatic retry is prohibited");
      }
      // A prompt edit is not authorization to regenerate old/failed assets.
      const priorNames = await readdir(join(root, ".calls")).catch((e) => {
        if (e.code === "ENOENT") return [] as string[];
        throw e;
      });
      for (const name of priorNames.filter((name) => name.endsWith(".json"))) {
        const prior = JSON.parse(await readFile(join(root, ".calls", name), "utf8"));
        if (prior.sourceHash === input.sourceHash && prior.state === state && prior.promptVersion !== promptVersion && !options.approvedPromptUpgrade) {
          throw new Error(`${state}: previous prompt version exists; explicit regeneration approval and output reconciliation required`);
        }
      }
      // A new version must use an empty output location even when regeneration is approved.
      const occupied = await readFile(output).catch((e) => { if (e.code === "ENOENT") return undefined; throw e; });
      if (occupied) throw new Error("Output already exists; select a new prepared version directory");
      const prompt = donorPrompt(state);
      const promptPath = join(directory, "donors", `${state}${id !== originalId ? "-replacement-1" : ""}.prompt.txt`);
      await writeFile(promptPath, prompt, { flag: "wx" });
      const details = { id, state, sourceHash: input.sourceHash, promptVersion, output,
        ...(options.approvedPromptUpgrade ? { authorization: "explicit-cli-prompt-upgrade" } : {}),
        ...(id !== originalId ? { replaces: originalId, authorization: "user-2026-09-04-plan-v2" } : {}) };
      await reserveCall(root, id, details);
      progress(`${state}:generating`);
      let requestId: string | undefined;
      const startedAt = new Date().toISOString();
      try {
        const result = await provider.edit(input, prompt, async (id) => {
          requestId = id;
          await writeFile(ledger, JSON.stringify({ ...details, status: "response-received", startedAt, requestId }, null, 2));
        });
        // Save the raw donor even if subsequent decode/geometry checks fail.
        await writeFile(output, result.bytes, { flag: "wx" });
        const decoded = await validateAndConvertInput({ fileName: `${state}.png`, bytes: result.bytes });
        if (decoded.width !== 1024 || decoded.height !== 1536) throw new Error("Donor dimensions differ from contract");
        await writeFile(ledger, JSON.stringify({ ...details, status: "succeeded", startedAt, finishedAt: new Date().toISOString(), requestId: result.requestId,
          outputHash: createHash("sha256").update(result.bytes).digest("hex") }, null, 2));
        progress(`${state}:succeeded`);
      } catch (error) {
        await writeFile(ledger, JSON.stringify({ ...details, status: "failed-or-unknown", startedAt, finishedAt: new Date().toISOString(), requestId, error: sanitizeProviderError(error) }, null, 2));
        throw error;
      }
    });
  }
}
