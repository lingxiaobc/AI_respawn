import { existsSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function canonical(path: string) {
  const absolute = resolve(path); let ancestor = absolute;
  while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
  return resolve(realpathSync(ancestor), relative(ancestor, absolute)).toLowerCase();
}
export function assertPrivateStorage(root: string) {
  const web = canonical(fileURLToPath(new URL("../../web", import.meta.url))), storage = canonical(root);
  if (storage === web || storage.startsWith(web + sep))
    throw new Error("AVATAR_STORAGE_DIR must be outside apps/web (including public). Private account data cannot be served as static files.");
}
