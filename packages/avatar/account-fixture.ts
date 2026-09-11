import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { AvatarStore } from "../../apps/server/src/avatar-store.ts";

export async function accountFixture() {
  const root = await mkdtemp(join(tmpdir(), "account-gateway-")), storage = join(root, "avatars");
  const avatars = new AvatarStore(storage), batch = randomUUID(), ids = [randomUUID(), randomUUID(), randomUUID()];
  avatars.addBatch(batch, batch);
  for (const [i, id] of ids.entries()) {
    const assets = join(storage, id); await mkdir(join(assets, "assets"), { recursive: true });
    await writeFile(join(assets, "source.jpg"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
    await writeFile(join(assets, "frame.html"), "<!doctype html><html><body>Test avatar</body></html>");
    await writeFile(join(assets, "profile.json"), "{}");
    await writeFile(join(assets, "assets/01.mp4"), "test-video-bytes");
    await writeFile(join(assets, "assets/combined_data.json.gz"), "test-data");
    avatars.save({ id, batchId: batch, name: ["共享人物", "第二人物", "未分配人物"][i]!, persona: "原始默认设定", status: "ready", stage: "ready", percent: 100,
      createdAt: new Date().toISOString(), sourcePath: join(assets, "private"), assetPath: assets, frameUrl: `/api/avatars/${id}/frame.html`, attempt: 0 });
  }
  avatars.close();
  const mock = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>(r => mock.once("listening", r));
  const holder = createServer(); await new Promise<void>(r => holder.listen(0, "127.0.0.1", r));
  const port = (holder.address() as { port: number }).port; await new Promise<void>(r => holder.close(() => r()));
  const upstreams: WebSocket[] = [], instructions: string[] = [], events: string[] = [];
  let holdPreparation = false, holdClose = false;
  mock.on("connection", ws => {
    upstreams.push(ws);
    ws.on("message", raw => {
      const e = JSON.parse(raw.toString()); events.push(e.type);
      if (e.type === "session.create") { instructions.push(e.session.instructions); if (!holdPreparation) ws.send(JSON.stringify({ type: "session.created" })); }
      if (e.type === "session.close" && !holdClose) ws.send(JSON.stringify({ type: "session.closed" }));
    });
  });
  const child = spawn(process.execPath, ["--experimental-strip-types", resolve("apps/server/src/server.ts")], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, PORT: String(port), AVATAR_STORAGE_DIR: storage, DIAGNOSTICS_DIR: join(root, "logs"), ADMIN_INITIAL_PASSWORD: "Fixture-admin-pass", AUTH_ADMIN_SECONDS:"28800",AUTH_USER_SECONDS:"604800",
      DOUBAO_API_KEY: "fixture-only", DOUBAO_WS_URL: `ws://127.0.0.1:${(mock.address() as { port: number }).port}` } });
  const sockets: WebSocket[] = [];
  child.stderr?.resume();
  const close = async () => {
    for (const ws of sockets) ws.terminate();
    if (child.exitCode === null) { child.kill(); await new Promise<void>(r => child.once("exit", () => r())); }
    for (const ws of mock.clients) ws.terminate();
    await new Promise<void>(r => mock.close(() => r()));
    await rm(root, { recursive: true, force: true });
  };
  try {
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(Error("Account fixture startup timed out")), 10_000);
      child.stdout?.on("data", data => { if (String(data).includes("gateway-ready")) { clearTimeout(timer); done(); } });
      child.once("error", reject); child.once("exit", () => { clearTimeout(timer); reject(Error("Account fixture exited")); });
    });
  } catch (e) { await close(); throw e; }
  const origin = `http://127.0.0.1:${port}`;
  const api = (path: string, method = "GET", data?: unknown, cookie = "", extra = {}) => fetch(origin + path, {
    method, headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json", "x-account-request": "1", "x-avatar-upload": "1", cookie, ...extra },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  const login = async (username: string, password: string) => {
    const r = await api("/api/auth/login", "POST", { username, password });
    if (!r.ok) throw Error(`Fixture login failed ${r.status}`);
    return r.headers.get("set-cookie")!.split(";")[0]!;
  };
  const connect = (id: string, cookie: string) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?avatar=${id}`, { origin: "http://127.0.0.1:5173", headers: { cookie } });
    sockets.push(ws); return ws;
  };
  return { root, storage, ids, port, origin, api, login, connect, close, upstreams, instructions, events,
    holdPreparation: (hold: boolean) => { holdPreparation = hold; }, holdClose: (hold: boolean) => { holdClose = hold; } };
}
