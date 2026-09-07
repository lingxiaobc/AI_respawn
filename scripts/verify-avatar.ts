import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve("apps/web/public/dh-live");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as {
  revision: string; files: Array<{ path: string; bytes: number; sha256: string }>;
};
for (const file of manifest.files) {
  const target = path.resolve(root, file.path);
  if (!target.startsWith(root + path.sep)) throw new Error("Manifest path escapes resource root");
  const data = await readFile(target);
  if (data.byteLength !== file.bytes || createHash("sha256").update(data).digest("hex") !== file.sha256) {
    throw new Error(`Avatar resource mismatch: ${file.path}`);
  }
}
console.log(`Verified ${manifest.files.length} avatar resources; upstream ${manifest.revision}`);
