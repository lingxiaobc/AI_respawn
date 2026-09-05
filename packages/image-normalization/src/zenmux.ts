import { NORMALIZATION_CONTRACT, NORMALIZATION_PROMPT } from "./contract.ts";
import type { ImageNormalizationProvider, ProviderResult, ValidatedImage } from "./types.ts";
import { sanitizeProviderError } from "./validation.ts";
import { readEditedImageStream } from "./image-stream.ts";

type FetchLike = typeof fetch;

interface ZenMuxOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  stream?: boolean;
}

interface ZenMuxResponse {
  data?: Array<{ b64_json?: string }>;
  model?: string;
  request_id?: string;
  id?: string;
  error?: { message?: string };
}

export class ZenMuxImageProvider implements ImageNormalizationProvider {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #stream: boolean;

  constructor(options: ZenMuxOptions) {
    if (!options.apiKey.trim()) throw new Error("ZENMUX_API_KEY is required");
    this.#apiKey = options.apiKey.trim();
    this.#baseUrl = (options.baseUrl ?? "https://zenmux.ai/api/v1").replace(/\/$/, "");
    this.#fetch = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 180_000;
    this.#stream = options.stream ?? false;
  }

  async normalize(input: ValidatedImage): Promise<ProviderResult> {
    return this.edit(input, NORMALIZATION_PROMPT);
  }

  async edit(input: ValidatedImage, prompt: string, onResponse?: (requestId?: string) => Promise<void>): Promise<ProviderResult> {
    const body = new FormData();
    body.set("image", new Blob([Uint8Array.from(input.pngBytes)], { type: "image/png" }), "source.png");
    body.set("prompt", prompt);
    body.set("model", NORMALIZATION_CONTRACT.model);
    body.set("input_fidelity", NORMALIZATION_CONTRACT.inputFidelity);
    body.set("quality", NORMALIZATION_CONTRACT.quality);
    body.set("size", `${NORMALIZATION_CONTRACT.width}x${NORMALIZATION_CONTRACT.height}`);
    body.set("n", String(NORMALIZATION_CONTRACT.count));
    body.set("output_format", NORMALIZATION_CONTRACT.outputFormat);
    if (this.#stream) {
      body.set("stream", "true");
      body.set("partial_images", "0");
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    let stage = "request-awaiting-headers";
    let httpStatus: number | undefined;
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(`${this.#baseUrl}/images/edits`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#apiKey}` },
        body,
        signal: controller.signal,
      });
      httpStatus = response.status;
      stage = "response-metadata-callback";
      const requestId = response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined;
      await onResponse?.(requestId);
      if (response.ok && response.headers.get("content-type")?.includes("text/event-stream")) {
        stage = "response-stream";
        const encoded = await readEditedImageStream(response);
        return { bytes: Buffer.from(encoded, "base64"), requestId, model: NORMALIZATION_CONTRACT.model };
      }
      // Do not turn transport/JSON failures into an empty, apparently valid payload.
      stage = "response-body";
      const text = await response.text();
      stage = "response-json";
      let payload: ZenMuxResponse | null;
      try {
        payload = JSON.parse(text) as ZenMuxResponse | null;
      } catch {
        // Native SyntaxError messages can contain response text, including secrets.
        throw new Error("ZenMux response was not valid JSON; response content omitted");
      }
      stage = "response-schema";
      if (!response.ok) {
        throw new Error(`ZenMux ${response.status}: ${payload?.error?.message ?? "image edit failed"}`);
      }
      const encoded = payload?.data?.[0]?.b64_json;
      if (typeof encoded !== "string" || !encoded) throw new Error("ZenMux response did not contain a non-empty string data[0].b64_json");
      return {
        bytes: Buffer.from(encoded, "base64"),
        requestId: requestId ?? payload?.request_id ?? payload?.id,
        model: payload?.model ?? NORMALIZATION_CONTRACT.model,
      };
    } catch (error) {
      const context = `[stage=${stage} http=${httpStatus ?? "none"} elapsedMs=${Date.now() - startedAt}]`;
      if (controller.signal.aborted) {
        throw new Error(`${context} ZenMux request timed out; completion state is unknown and was not retried`);
      }
      const raw = error instanceof Error ? error.message : String(error);
      const redacted = raw.split(this.#apiKey).join("[REDACTED]");
      const details = error as { code?: unknown; cause?: { code?: unknown } } | null;
      const errorCode = details?.cause?.code ?? details?.code;
      const code = typeof errorCode === "string" && /^[A-Z0-9_]{1,40}$/.test(errorCode) ? ` (${errorCode})` : "";
      throw new Error(sanitizeProviderError(`${context}${code} ${redacted}`));
    } finally {
      clearTimeout(timeout);
    }
  }
}
