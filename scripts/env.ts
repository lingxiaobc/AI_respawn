import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const ROOT_ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));
const projectKey = /^(ZENMUX_|DOUBAO_|ROLE_|NORMALIZATION_|MOTION_|DIAGNOSTICS_|LIVE2D_|PLAYWRIGHT_|VITE_)/i;
const projectNames = new Set(["PORT", "OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MPLBACKEND", "MPLCONFIGDIR"]);

/** Only application configuration is replaced; OS execution variables such as PATH remain intact. */
export function applyRootEnv(text: string, target: NodeJS.ProcessEnv): void {
  const values = parseEnv(text.replace(/^\uFEFF/, ""));
  for (const key of Object.keys(target)) {
    if (projectKey.test(key) || projectNames.has(key.toUpperCase()) || Object.hasOwn(values, key)) delete target[key];
  }
  for (const [key, value] of Object.entries(values)) target[key] = value;
}

export async function loadLocalEnv(): Promise<void> {
  // Resolve against this repository, never the launching terminal's cwd.
  // Missing/unreadable .env is fatal: never silently fall back to machine credentials.
  let text: string;
  try { text = await readFile(ROOT_ENV_PATH, "utf8"); }
  catch { throw new Error("ROOT_ENV_UNAVAILABLE: repository root .env is missing or unreadable"); }
  applyRootEnv(text, process.env);
}
