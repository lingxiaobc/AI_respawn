import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NormalizationQueue } from "../../../packages/image-normalization/src/queue.ts";
import { InputValidationError } from "../../../packages/image-normalization/src/validation.ts";

const MAX_BODY_BYTES = 50 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 1;

interface UploadBody {
  files?: Array<{ name?: unknown; type?: unknown; dataBase64?: unknown }>;
}

export async function handleNormalizationHttp(
  request: IncomingMessage,
  response: ServerResponse,
  queue: NormalizationQueue,
  isAllowedOrigin: (request: IncomingMessage) => boolean,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith("/api/normalization/")) return false;
  if (request.headers.origin && !isAllowedOrigin(request)) {
    json(response, 403, { error: "仅允许本机管理页面访问" });
    return true;
  }
  try {
    if (request.method === "GET" && url.pathname === "/api/normalization/jobs") {
      json(response, 200, { jobs: queue.list() });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/normalization/jobs") {
      const body = JSON.parse((await readBoundedBody(request)).toString("utf8")) as UploadBody;
      if (!Array.isArray(body.files) || body.files.length === 0 || body.files.length > MAX_FILES_PER_REQUEST) {
        throw new InputValidationError(`每次需要上传 1 至 ${MAX_FILES_PER_REQUEST} 张图片`);
      }
      const jobs = [];
      for (const file of body.files) {
        if (typeof file.name !== "string" || typeof file.type !== "string" || typeof file.dataBase64 !== "string") {
          throw new InputValidationError("上传字段格式不正确");
        }
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataBase64)) {
          throw new InputValidationError(`${file.name} 的图片数据不是有效 Base64`);
        }
        jobs.push(await queue.submit({
          fileName: file.name,
          mimeType: file.type,
          bytes: Buffer.from(file.dataBase64, "base64"),
        }));
      }
      json(response, 202, { jobs });
      return true;
    }
    const match = request.method === "GET"
      ? /^\/api\/normalization\/assets\/([^/]+)\/(source|canonical)$/.exec(url.pathname)
      : null;
    if (match) {
      const path = queue.resolveAsset(decodeURIComponent(match[1]!), match[2] as "source" | "canonical");
      const bytes = await readFile(path);
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(bytes.byteLength),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(bytes);
      return true;
    }
    json(response, 404, { error: "接口不存在" });
    return true;
  } catch (error) {
    const status = error instanceof InputValidationError ? error.statusCode : isMissingFile(error) ? 404 : 500;
    const message = status === 500 ? "规范化服务处理失败" : error instanceof Error ? error.message : "请求失败";
    json(response, status, { error: message });
    return true;
  }
}

async function readBoundedBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.byteLength;
    if (size > MAX_BODY_BYTES) throw new InputValidationError("上传请求超过 50 MiB 限制");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
