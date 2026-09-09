import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const children: ChildProcess[] = [];
let shuttingDown = false;

function run(args: string[], ipc = false): ChildProcess {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ipc ? ["inherit","inherit","inherit","ipc"] : "inherit" });
  children.push(child);
  child.once("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`Development child exited with code ${code ?? "unknown"}`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

async function shutdown(code = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.all(children.map(child=>new Promise<void>(done=>{
    if(child.exitCode!==null||child.signalCode!==null){done();return;}
    const timeout=setTimeout(()=>{child.kill("SIGKILL");done();},15_000);
    child.once("exit",()=>{clearTimeout(timeout);done();});
    if(child.connected)child.send({type:"shutdown"});
    else if(!child.killed)child.kill("SIGTERM");
  })));
  process.exit(code);
}

run(["--experimental-strip-types", resolve("apps/server/src/server.ts")],true);
run([resolve("node_modules/vite/bin/vite.js"), "--config", resolve("apps/web/vite.config.ts")]);

process.once("SIGINT", () => shutdown());
process.once("SIGTERM", () => shutdown());
