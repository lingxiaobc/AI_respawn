import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { loadImage } from "@napi-rs/canvas";
import { NORMALIZATION_CONTRACT } from "./contract.ts";
import type {
  ImageInput,
  ImageNormalizationProvider,
  NormalizationJob,
  PublicNormalizationJob,
  ValidatedImage,
} from "./types.ts";
import { detectMime, InputValidationError, safeOutputKey, sanitizeProviderError, validateAndConvertInput } from "./validation.ts";

interface QueueOptions {
  root: string;
  provider: ImageNormalizationProvider;
  now?: () => Date;
}

interface StoredOutput {
  schemaVersion: 1;
  outputKey: string;
  sourceFileName: string;
  source: NormalizationJob["source"];
  canonical?: NormalizationJob["canonical"];
  model: string;
  promptVersion: string;
  status: "pending" | "succeeded" | "failed";
  createdAt: string;
  completedAt?: string;
  providerRequestId?: string;
  error?: string;
}

export class NormalizationQueue {
  readonly #root: string;
  readonly #jobsRoot: string;
  readonly #provider: ImageNormalizationProvider;
  readonly #now: () => Date;
  readonly #jobs = new Map<string, NormalizationJob>();
  readonly #pending: Array<{ jobId: string; image: ValidatedImage }> = [];
  #processing = false;

  constructor(options: QueueOptions) {
    this.#root = resolve(options.root);
    this.#jobsRoot = join(this.#root, ".jobs");
    this.#provider = options.provider;
    this.#now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    await mkdir(this.#jobsRoot, { recursive: true });
    for (const name of await readdir(this.#jobsRoot).catch(() => [])) {
      if (!name.endsWith(".json")) continue;
      try {
        const job = JSON.parse(await readFile(join(this.#jobsRoot, name), "utf8")) as NormalizationJob;
        if (job.status === "running" || job.status === "queued") {
          job.status = "failed";
          job.completedAt = this.#timestamp();
          job.error = "任务因本地服务重启而中止，未自动重试";
          await this.#writeJob(job);
        }
        this.#jobs.set(job.id, job);
      } catch {
        // Ignore malformed private job files rather than exposing their contents.
      }
    }
  }

  async submit(input: ImageInput): Promise<PublicNormalizationJob> {
    const image = await validateAndConvertInput(input);
    const active = [...this.#jobs.values()].find((job) =>
      job.source.sha256 === image.sourceHash && (job.status === "queued" || job.status === "running"));
    if (active) return this.#public(active);
    const outputKey = safeOutputKey(image.fileName, image.sourceHash);
    const id = randomUUID();
    const existing = await this.#readOutput(outputKey);
    let skipped = false;
    if (existing?.status === "succeeded") {
      try {
        const bytes = await readFile(join(this.#root, outputKey, "canonical.png"));
        if (createHash("sha256").update(bytes).digest("hex") !== existing.canonical?.sha256) throw new Error("hash mismatch");
        const decoded = await loadImage(bytes);
        if (decoded.width !== NORMALIZATION_CONTRACT.width || decoded.height !== NORMALIZATION_CONTRACT.height) throw new Error("size mismatch");
        skipped = true;
      } catch {
        // A legacy success may predate the shared ledger: never turn corruption into a new paid call.
        throw new InputValidationError("CANONICAL_CACHE_INVALID: 成功规范图缺失或损坏，请核对缓存；未重新生成");
      }
    }
    const job: NormalizationJob = {
      schemaVersion: 1,
      id,
      outputKey,
      fileName: image.fileName,
      status: skipped ? "skipped" : "queued",
      createdAt: this.#timestamp(),
      completedAt: skipped ? this.#timestamp() : undefined,
      source: {
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        sha256: image.sourceHash,
      },
      canonical: skipped ? existing?.canonical : undefined,
      model: existing?.model ?? NORMALIZATION_CONTRACT.model,
      promptVersion: NORMALIZATION_CONTRACT.promptVersion,
      providerRequestId: skipped ? existing?.providerRequestId : undefined,
    };
    this.#jobs.set(id, job);
    await this.#writeJob(job);
    if (!skipped) {
      await this.#prepareOutput(outputKey, image, job.createdAt);
      this.#pending.push({ jobId: id, image });
      void this.#pump();
    }
    return this.#public(job);
  }

  list(): PublicNormalizationJob[] {
    return [...this.#jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((job) => this.#public(job));
  }

  get(id: string): PublicNormalizationJob | undefined {
    const job = this.#jobs.get(id);
    return job ? this.#public(job) : undefined;
  }

  async waitFor(id: string): Promise<PublicNormalizationJob> {
    while (true) {
      const job = this.#jobs.get(id);
      if (!job) throw new Error("Unknown normalization job");
      if (["succeeded", "failed", "skipped"].includes(job.status)) return this.#public(job);
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
  }

  resolveAsset(outputKey: string, kind: "source" | "canonical"): string {
    if (!/^[\p{L}\p{N}_-]{1,80}$/u.test(outputKey)) throw new InputValidationError("无效的生成物标识");
    const path = resolve(this.#root, outputKey, `${kind}.png`);
    if (!path.startsWith(`${this.#root}${sep}`)) throw new InputValidationError("无效的生成物路径");
    return path;
  }

  async #pump(): Promise<void> {
    if (this.#processing) return;
    this.#processing = true;
    try {
      while (this.#pending.length > 0) {
        const entry = this.#pending.shift()!;
        const job = this.#jobs.get(entry.jobId);
        if (!job) continue;
        job.status = "running";
        job.startedAt = this.#timestamp();
        await this.#writeJob(job);
        try {
          const result = await this.#provider.normalize(entry.image);
          if (detectMime(result.bytes) !== "image/png") throw new Error("规范图必须是 PNG");
          const decoded = await loadImage(result.bytes);
          if (decoded.width !== NORMALIZATION_CONTRACT.width || decoded.height !== NORMALIZATION_CONTRACT.height) {
            throw new Error(`规范图必须是 ${NORMALIZATION_CONTRACT.width}x${NORMALIZATION_CONTRACT.height} PNG`);
          }
          const canonicalHash = createHash("sha256").update(result.bytes).digest("hex");
          await this.#writeAtomic(join(this.#root, job.outputKey, "canonical.png"), result.bytes);
          job.status = "succeeded";
          job.completedAt = this.#timestamp();
          job.model = result.model;
          job.providerRequestId = result.requestId;
          job.canonical = {
            mimeType: "image/png",
            width: decoded.width,
            height: decoded.height,
            sha256: canonicalHash,
          };
          await this.#writeOutput(job, "succeeded");
        } catch (error) {
          job.status = "failed";
          job.completedAt = this.#timestamp();
          job.error = sanitizeProviderError(error);
          await this.#writeOutput(job, "failed");
        }
        await this.#writeJob(job);
      }
    } finally {
      this.#processing = false;
    }
  }

  async #prepareOutput(outputKey: string, image: ValidatedImage, createdAt: string): Promise<void> {
    const directory = join(this.#root, outputKey);
    await mkdir(directory, { recursive: true });
    await this.#writeAtomic(join(directory, "source.png"), image.pngBytes);
    const output: StoredOutput = {
      schemaVersion: 1,
      outputKey,
      sourceFileName: image.fileName,
      source: { mimeType: image.mimeType, width: image.width, height: image.height, sha256: image.sourceHash },
      model: NORMALIZATION_CONTRACT.model,
      promptVersion: NORMALIZATION_CONTRACT.promptVersion,
      status: "pending",
      createdAt,
    };
    await this.#writeJson(join(directory, "metadata.json"), output);
  }

  async #writeOutput(job: NormalizationJob, status: StoredOutput["status"]): Promise<void> {
    const existing = await this.#readOutput(job.outputKey);
    if (!existing) throw new Error("Output metadata is missing");
    await this.#writeJson(join(this.#root, job.outputKey, "metadata.json"), {
      ...existing,
      status,
      completedAt: job.completedAt,
      canonical: job.canonical,
      model: job.model,
      providerRequestId: job.providerRequestId,
      error: job.error,
    } satisfies StoredOutput);
  }

  async #readOutput(outputKey: string): Promise<StoredOutput | undefined> {
    try {
      return JSON.parse(await readFile(join(this.#root, outputKey, "metadata.json"), "utf8")) as StoredOutput;
    } catch {
      return undefined;
    }
  }

  async #writeJob(job: NormalizationJob): Promise<void> {
    await this.#writeJson(join(this.#jobsRoot, `${job.id}.json`), job);
  }

  async #writeJson(path: string, value: unknown): Promise<void> {
    await this.#writeAtomic(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
  }

  async #writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
    await mkdir(resolve(path, ".."), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  }

  async #exists(path: string): Promise<boolean> {
    return stat(path).then(() => true, () => false);
  }

  #timestamp(): string {
    return this.#now().toISOString();
  }

  #public(job: NormalizationJob): PublicNormalizationJob {
    return {
      ...job,
      sourceUrl: `/api/normalization/assets/${encodeURIComponent(job.outputKey)}/source`,
      canonicalUrl: job.canonical ? `/api/normalization/assets/${encodeURIComponent(job.outputKey)}/canonical` : undefined,
    };
  }
}
