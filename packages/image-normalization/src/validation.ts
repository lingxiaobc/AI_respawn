import { createHash } from "node:crypto";
import { basename } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_INPUT_BYTES,
  MAX_INPUT_EDGE,
  MIN_INPUT_EDGE,
} from "./contract.ts";
import type { AcceptedImageType, ImageInput, ValidatedImage } from "./types.ts";

export class InputValidationError extends Error {
  readonly statusCode = 400;
}

export async function validateAndConvertInput(input: ImageInput): Promise<ValidatedImage> {
  if (!input.fileName.trim()) throw new InputValidationError("图片文件名不能为空");
  if (input.bytes.byteLength === 0) throw new InputValidationError(`${input.fileName} 是空文件`);
  if (input.bytes.byteLength > MAX_INPUT_BYTES) throw new InputValidationError(`${input.fileName} 超过 12 MiB 限制`);

  const detectedMime = detectMime(input.bytes);
  if (!detectedMime || !ACCEPTED_IMAGE_TYPES.includes(detectedMime)) {
    throw new InputValidationError(`${input.fileName} 仅支持 PNG、JPEG 或 WebP`);
  }
  if (input.mimeType && input.mimeType !== "application/octet-stream" && input.mimeType !== detectedMime) {
    throw new InputValidationError(`${input.fileName} 的文件内容与 MIME 类型不一致`);
  }
  let decoded: Awaited<ReturnType<typeof loadImage>>;
  try {
    decoded = await loadImage(Buffer.from(input.bytes));
  } catch {
    throw new InputValidationError(`${input.fileName} 不是可解码的 PNG、JPEG 或 WebP 图片`);
  }
  const width = decoded.width;
  const height = decoded.height;
  if (Math.min(width, height) < MIN_INPUT_EDGE) {
    throw new InputValidationError(`${input.fileName} 分辨率过低，短边至少需要 ${MIN_INPUT_EDGE}px`);
  }
  if (Math.max(width, height) > MAX_INPUT_EDGE) {
    throw new InputValidationError(`${input.fileName} 分辨率过高，长边不能超过 ${MAX_INPUT_EDGE}px`);
  }

  const bytes = Buffer.from(input.bytes);
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").drawImage(decoded, 0, 0, width, height);
  const pngBytes = await canvas.encode("png");
  return {
    fileName: basename(input.fileName),
    mimeType: detectedMime as AcceptedImageType,
    width,
    height,
    sourceHash,
    pngBytes,
  };
}

export function detectMime(bytes: Uint8Array): AcceptedImageType | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF"
    && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") return "image/webp";
  return undefined;
}

export function safeOutputKey(fileName: string, sha256: string): string {
  const stem = basename(fileName).replace(/\.[^.]+$/, "");
  const safeStem = stem.normalize("NFKC").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${safeStem || "portrait"}-${sha256.slice(0, 12)}`;
}

export function sanitizeProviderError(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value);
  return raw
    .replace(/(?:authorization\s*[:=]?\s*)?bearer\s+[^\s,;]+/gi, "[REDACTED]")
    .replace(/(?:authorization|api[_-]?key|bearer)\s*[:=]?\s*[^\s,;]+/gi, "[REDACTED]")
    .replace(/[A-Za-z0-9+/]{100,}={0,2}/g, "[REDACTED_BINARY]")
    .slice(0, 500);
}
