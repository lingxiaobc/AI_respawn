import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { createInterface } from "node:readline";
import { AvatarStore } from "../apps/server/src/avatar-store.ts";
import { AuthStore } from "../apps/server/src/auth-store.ts";
import { loadLocalEnv } from "./env.ts";
import { assertPrivateStorage } from "../apps/server/src/storage-safety.ts";

await loadLocalEnv();
const mode = process.argv[2] ?? "init";
if (!["init", "reset"].includes(mode)) throw new Error("Use init or reset");
const root = resolve(process.env.AVATAR_STORAGE_DIR ?? "artifacts/avatars"), path = resolve(root, "avatars.sqlite");
assertPrivateStorage(root);
if (!existsSync(path)) { const seed = new AvatarStore(root); seed.close(); }
const db = new DatabaseSync(path);
try {
  db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  const hasAdmin = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()
    && db.prepare("SELECT id FROM users WHERE user_type='ADMIN'").get();
  if (mode === "init" && hasAdmin) { console.log("Administrator already initialized; no password changed."); }
  else {
    await backup(db, resolve(root, `account-backup-${Date.now()}.sqlite`));
    const store = new AuthStore(db);
    let password = process.env.ADMIN_INITIAL_PASSWORD;
    if (!password) {
      if (process.stdin.isTTY) throw new Error("Supply password through protected stdin or ADMIN_INITIAL_PASSWORD; interactive echo is disabled.");
      console.log("Awaiting administrator password on protected stdin (not echoed).");
      const input = createInterface({ input: process.stdin });
      password = await new Promise<string>((done, reject) => {
        let received = false;
        input.once("line", line => { received = true; input.close(); done(line); });
        input.once("close", () => { if (!received) reject(new Error("No password received on stdin")); });
        input.once("error", reject);
      });
    }
    if (mode === "init") await store.initialize(password, process.argv.includes("--local-test-initial") && process.env.NODE_ENV !== "production");
    else {
      const admin = store.admin(); if (!admin) throw new Error("Initialize administrator first");
      await store.resetPassword(null, admin.id, password);
    }
    password = undefined; delete process.env.ADMIN_INITIAL_PASSWORD;
    console.log(mode === "init" ? "Administrator initialized." : "Administrator password reset; old sessions revoked.");
  }
} finally { db.close(); }
