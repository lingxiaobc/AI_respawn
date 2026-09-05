export type AcceptedImageType = "image/png" | "image/jpeg" | "image/webp";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";

export interface ImageInput {
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array;
}

export interface ValidatedImage {
  fileName: string;
  mimeType: AcceptedImageType;
  width: number;
  height: number;
  sourceHash: string;
  pngBytes: Buffer;
}

export interface ProviderResult {
  bytes: Buffer;
  requestId?: string;
  model: string;
}

export interface ImageNormalizationProvider {
  normalize(input: ValidatedImage): Promise<ProviderResult>;
}

export interface NormalizationJob {
  schemaVersion: 1;
  id: string;
  outputKey: string;
  fileName: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  source: { mimeType: AcceptedImageType; width: number; height: number; sha256: string };
  canonical?: { mimeType: "image/png"; width: number; height: number; sha256: string };
  model: string;
  promptVersion: string;
  providerRequestId?: string;
  error?: string;
}

export interface PublicNormalizationJob extends NormalizationJob {
  sourceUrl: string;
  canonicalUrl?: string;
}

