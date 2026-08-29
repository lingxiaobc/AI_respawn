import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadLocalEnv } from "./env.ts";

await loadLocalEnv();

const directory = resolve(process.env.DIAGNOSTICS_DIR ?? "logs");
const id = process.argv.find((arg) => arg.startsWith("--id="))?.slice(5);
const session = process.argv.find((arg) => arg.startsWith("--session="))?.slice(10);
const exportPath = process.argv.find((arg) => arg.startsWith("--export="))?.slice(9);
const tailRaw = process.argv.find((arg) => arg.startsWith("--tail="))?.slice(7);
const tail = tailRaw === undefined ? 50 : Number.parseInt(tailRaw, 10);
if (!Number.isInteger(tail) || tail < 1 || tail > 1_000) throw new Error("--tail must be between 1 and 1000");

let files: string[] = [];
try {
  files = (await readdir(directory))
    .filter((name) => /^diagnostics-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const records: string[] = [];
let invalidLines = 0;
for (const file of files) {
  const content = await readFile(join(directory, file), "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (id && record.diagnostic_id !== id) continue;
      if (session && record.session_id !== session) continue;
      records.push(JSON.stringify(record));
    } catch {
      invalidLines += 1;
    }
  }
}

const selected = records.slice(-tail);
if (exportPath) {
  const target = resolve(exportPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, selected.length > 0 ? `${selected.join("\n")}\n` : "", "utf8");
}

console.log(JSON.stringify({
  type: "diagnostics-summary",
  directory,
  files: files.length,
  records: selected.length,
  invalid_lines: invalidLines,
  filter: id ? { diagnostic_id: id } : session ? { session_id: session } : null,
  export: exportPath ? resolve(exportPath) : null,
}));
for (const line of selected) console.log(line);
