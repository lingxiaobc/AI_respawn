import { resolve } from "node:path";
import { generateDonors } from "../packages/portrait-motion/src/donors.ts";
import { ZenMuxImageProvider } from "../packages/image-normalization/src/zenmux.ts";
import { loadLocalEnv } from "./env.ts";

await loadLocalEnv();
if (process.env.ROLE_ALLOW_PAID !== "1") throw new Error("Legacy paid donor CLI disabled. Use role-resources.ts for cache replay; new calls require explicit authorization and ROLE_ALLOW_PAID=1.");
const directory = process.argv[2];
const flags = process.argv.slice(3);
if (!directory || flags.some((flag) => !["--approve-prompt-upgrade", "--stream"].includes(flag))) throw new Error("Usage: node --experimental-strip-types scripts/motion-donors.ts <prepared directory> [--approve-prompt-upgrade] [--stream]");
await generateDonors(resolve(directory), resolve("AI_output/motion"), new ZenMuxImageProvider({
  apiKey: process.env.ZENMUX_API_KEY ?? "", baseUrl: process.env.ZENMUX_BASE_URL,
  stream: flags.includes("--stream"), timeoutMs: 300_000,
}), (state) => console.log(new Date().toISOString(), state), { approvedPromptUpgrade: flags.includes("--approve-prompt-upgrade") });
