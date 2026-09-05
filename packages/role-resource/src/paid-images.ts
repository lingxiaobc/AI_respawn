import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hash, atomicJson } from "./state.ts";
import { reserveCall, withCallLock } from "../../portrait-motion/src/donors.ts";
import { sanitizeProviderError, validateAndConvertInput } from "../../image-normalization/src/validation.ts";
import type { ValidatedImage } from "../../image-normalization/src/types.ts";
import type { ZenMuxImageProvider } from "../../image-normalization/src/zenmux.ts";
import { NORMALIZATION_CONTRACT, NORMALIZATION_PROMPT } from "../../image-normalization/src/contract.ts";

export class PaidImages {
  readonly root: string;
  readonly provider: Pick<ZenMuxImageProvider, "edit">;
  readonly enabled: boolean;
  constructor(root: string, provider: Pick<ZenMuxImageProvider, "edit">, enabled = false) { this.root = root; this.provider = provider; this.enabled = enabled; }
  async normalize(input: ValidatedImage) {
    return { bytes: await this.image(input, "normalize", NORMALIZATION_CONTRACT.promptVersion, NORMALIZATION_PROMPT), model: NORMALIZATION_CONTRACT.model };
  }
  async image(input: ValidatedImage, state: string, version: string, prompt: string): Promise<Buffer> {
    return withCallLock(this.root, async () => {
      const id = hash(`${input.sourceHash}:${version}:${state}`);
      const path = join(this.root, ".calls", `${id}.json`);
      const previous = await readFile(path, "utf8").catch((e) => { if (e.code === "ENOENT") return undefined; throw e; });
      if (previous) {
        const entry = JSON.parse(previous);
        if (entry.status !== "succeeded") throw new Error("PAID_COMPLETION_UNKNOWN: automatic retry prohibited");
        const bytes = await readFile(entry.output);
        if (hash(bytes) !== entry.outputHash) throw new Error("PAID_CACHE_HASH_MISMATCH");
        return bytes;
      }
      for (const name of await readdir(join(this.root, ".calls")).catch((e) => { if (e.code === "ENOENT") return []; throw e; })) {
        if (!name.endsWith(".json")) continue;
        const entry = JSON.parse(await readFile(join(this.root, ".calls", name), "utf8"));
        if (entry.sourceHash === input.sourceHash && entry.state === state) throw new Error("PRIOR_CALL_REQUIRES_RECONCILIATION: changed prompt or historical replacement exists");
      }
      if (!this.enabled) throw new Error("PAID_CALL_DISABLED: development run permits no new generation");
      await mkdir(join(this.root, "shared-images"), { recursive: true });
      const output = resolve(this.root, "shared-images", `${id}.png`);
      const details = { id, state, sourceHash: input.sourceHash, promptVersion: version, output, startedAt: new Date().toISOString() };
      await reserveCall(this.root, id, details); // Same lock, directory and 18-attempt limit as historical donors.
      try {
        const result = await this.provider.edit(input, prompt);
        await writeFile(output, result.bytes, { flag: "wx" });
        const decoded = await validateAndConvertInput({ fileName: "generated.png", bytes: result.bytes });
        if (decoded.width !== 1024 || decoded.height !== 1536) throw new Error("OUTPUT_SIZE_MISMATCH");
        await atomicJson(path, { ...details, status: "succeeded", requestId: result.requestId, outputHash: hash(result.bytes), finishedAt: new Date().toISOString() });
        return result.bytes;
      } catch (e) {
        await atomicJson(path, { ...details, status: "failed-or-unknown", error: sanitizeProviderError(e), finishedAt: new Date().toISOString() });
        throw e;
      }
    });
  }
}
