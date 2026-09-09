import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";

export type ProcessJob = (directory: string, id: string, progress: (stage: string, percent: number) => void,
  signal: AbortSignal, source: string) => Promise<void>;
export class WorkerStopError extends Error {}

export const prepareAvatar: ProcessJob = async (directory, id, progress, signal, source) => {
  const python = resolve(process.env.AVATAR_PYTHON ?? ".cache/dh-prep-py312/Scripts/python.exe");
  const weights = resolve(process.env.AVATAR_WEIGHTS ?? "epoch_40_new.pth");
  try { await stat(python); await stat(weights); await stat(resolve(".cache/dh-live-upstream/data_preparation_web.py")); }
  catch { throw new Error("缺少照片处理环境或权重，请按启动说明配置"); }
  signal.throwIfAborted();
  const env: NodeJS.ProcessEnv = { PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" };
  for (const key of ["SystemRoot","WINDIR","PATH","TEMP","TMP","USERPROFILE","LOCALAPPDATA","APPDATA"])
    if (process.env[key]) env[key] = process.env[key];
  await new Promise<void>((done, reject) => {
    const child = spawn(python, ["-X","utf8",resolve("scripts/prepare-avatar.py"),"--input",source,
      "--output",directory,"--weights",weights,"--public-url",`/api/avatars/${id}/`,
      ...(process.platform === "win32" ? ["--parent-pid",String(process.pid)] : [])],
      { cwd: process.cwd(), env, windowsHide: true, stdio: ["ignore","pipe","pipe"] });
    let pending = "", failure = "", expired = false;
    let stopping: Promise<void> | undefined;
    const stop = () => {
      if (stopping || !child.pid || child.exitCode !== null) return;
      const pid = child.pid; // Only the worker spawned by this invocation and its children.
      stopping = process.platform === "win32" ? new Promise<void>((resolveStop, rejectStop) => {
        const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", rejectStop);
        killer.once("close", code => code === 0 || child.exitCode !== null ? resolveStop() : rejectStop(new Error("人物处理进程未能停止")));
      }) : new Promise<void>(resolveStop => { child.kill("SIGKILL"); child.once("close", () => resolveStop()); });
      // The close handler awaits this promise before the scheduler may start a call.
      void stopping.catch(() => {
        clearTimeout(timeout);
        reject(new WorkerStopError("人物制作未能安全暂停，请重启服务后重试"));
      });
    };
    const timeout = setTimeout(() => { expired = true; stop(); }, 180_000);
    const abort = () => stop();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) stop();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      pending += text;
      if (pending.length > 65_536) { failure = "人物处理输出异常"; stop(); return; }
      const lines = pending.split("\n"); pending = lines.pop()!;
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.stage === "failed") {
            const message = String(event.message);
            failure = /^(请|只支持|图片|人脸|人物资源|原始照片)/.test(message) ? message.slice(0,200) : "人物制作失败，请检查本地处理环境与模型";
          } else if (!signal.aborted) progress(event.stage, event.percent);
        } catch { /* Non-protocol upstream output is ignored. */ }
      }
    });
    child.stderr.resume();
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); };
    child.once("error", () => { cleanup(); reject(new Error("无法启动本地照片处理环境")); });
    child.once("close", async code => {
      cleanup();
      try {
        await stopping;
        if (signal.aborted) throw signal.reason;
        if (code === 0 && !expired && !failure) done();
        else reject(new Error(expired ? "人物制作超过 3 分钟，请检查环境或更换照片" : failure || "人物制作失败，请检查本地处理环境"));
      } catch (error) { reject(error); }
    });
  });
};
