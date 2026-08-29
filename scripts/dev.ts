import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const children: ChildProcess[] = [];
let shuttingDown = false;

function run(args: string[]): ChildProcess {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: "inherit" });
  children.push(child);
  child.once("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`Development child exited with code ${code ?? "unknown"}`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function shutdown(code = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (!child.killed) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 250).unref();
}

run(["--experimental-strip-types", resolve("apps/server/src/server.ts")]);
run([resolve("node_modules/vite/bin/vite.js"), "--config", resolve("apps/web/vite.config.ts")]);

process.once("SIGINT", () => shutdown());
process.once("SIGTERM", () => shutdown());
