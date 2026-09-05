import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NormalizationQueue } from "../packages/image-normalization/src/queue.ts";
import { validateAndConvertInput } from "../packages/image-normalization/src/validation.ts";
import { ZenMuxImageProvider } from "../packages/image-normalization/src/zenmux.ts";
import { loadLocalEnv } from "./env.ts";
import { PaidImages } from "../packages/role-resource/src/paid-images.ts";

interface Arguments {
  files: string[];
  dryRun: boolean;
  output: string;
}

function parseArguments(argv: string[]): Arguments {
  const files: string[] = [];
  let dryRun = false;
  let output = process.env.NORMALIZATION_OUTPUT_DIR ?? resolve("AI_output", "normalized");
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === "--help" || value === "-h") {
      console.log("用法: npm run normalize:batch -- [--dry-run] [--output <目录>] <图片...>");
      console.log("默认串行处理；已有成功结果按内容哈希跳过；失败后停止；不会自动重试。");
      process.exit(0);
    }
    if (value === "--dry-run") dryRun = true;
    else if (value === "--output") {
      const next = argv[++index];
      if (!next) throw new Error("--output 需要目录参数");
      output = resolve(next);
    } else if (value.startsWith("-")) throw new Error(`未知参数: ${value}`);
    else files.push(resolve(value));
  }
  if (files.length === 0) throw new Error("请明确指定至少一张图片；命令不会自动扫描目录");
  return { files, dryRun, output };
}

async function main(): Promise<void> {
  await loadLocalEnv();
  const args = parseArguments(process.argv.slice(2));
  if (args.dryRun) {
    for (const path of args.files) {
      const image = await validateAndConvertInput({ fileName: path, bytes: await readFile(path) });
      console.log(JSON.stringify({ file: path, status: "valid", width: image.width, height: image.height, sha256: image.sourceHash }));
    }
    return;
  }
  const apiKey = process.env.ZENMUX_API_KEY?.trim();
  if (!apiKey) throw new Error("ZENMUX_API_KEY is required in the untracked .env file");
  const queue = new NormalizationQueue({
    root: args.output,
    provider: new PaidImages(resolve("AI_output/motion"), new ZenMuxImageProvider({ apiKey, baseUrl: process.env.ZENMUX_BASE_URL }), process.env.ROLE_ALLOW_PAID === "1"),
  });
  await queue.initialize();
  for (const path of args.files) {
    const submitted = await queue.submit({ fileName: path, bytes: await readFile(path) });
    const result = submitted.status === "skipped" ? submitted : await queue.waitFor(submitted.id);
    console.log(JSON.stringify({ file: path, status: result.status, outputKey: result.outputKey, error: result.error }));
    if (result.status === "failed") throw new Error(`规范化失败：${result.error ?? "未知错误"}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "批处理失败");
  process.exitCode = 1;
});
