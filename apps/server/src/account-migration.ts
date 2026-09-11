import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { assertPrivateStorage } from "./storage-safety.ts";

/** Online backup includes WAL; run before opening the legacy store. */
export async function backupBeforeAccounts(root: string) {
  assertPrivateStorage(root);
  const path = resolve(root, "avatars.sqlite");
  if (!existsSync(path)) return;
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=5000;");
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get())
      await backup(db, resolve(root, `before-accounts-${Date.now()}.sqlite`));
  } finally { db.close(); }
}
