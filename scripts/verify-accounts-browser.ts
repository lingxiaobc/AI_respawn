import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { accountFixture } from "../packages/avatar/account-fixture.ts";

// Browser verification uses an isolated SQLite database and mock upstream only.
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_EXECUTABLE) throw new Error("Set PLAYWRIGHT_MODULE and CHROME_EXECUTABLE to installed runtime paths");
const playwright = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const { chromium } = playwright.default ?? playwright;
const fixture = await accountFixture(), output = resolve("artifacts/account-verification");
await mkdir(output, { recursive: true });
const web = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "--config", "apps/web/vite.config.ts"], {
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(fixture.port) } });
let browser: any;
try {
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(Error("Vite start timeout")), 10_000);
    web.stdout.on("data", data => { if (String(data).includes("5173")) { clearTimeout(timer); done(); } });
    web.stderr.resume(); web.once("error", reject); web.once("exit", () => { clearTimeout(timer); reject(Error("Vite exited; ensure 5173 is free")); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE, headless: true });
  const probe = resolve(output, "private-probe.sqlite"); await writeFile(probe, "private-test-sentinel");
  for (const suffix of ["", "?raw", "?url", "?import"]) {
    const response = await fetch(`http://127.0.0.1:5173/@fs/${probe.replaceAll("\\", "/")}${suffix}`);
    assert.equal(response.status, 403, "Vite must not expose database or private data");
  }
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const userContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adminPage = await adminContext.newPage(), userPage = await userContext.newPage();
  adminPage.setDefaultTimeout(10_000); userPage.setDefaultTimeout(10_000);
  const errors: string[] = [];
  for (const p of [adminPage, userPage]) p.on("pageerror", (error: Error) => errors.push(error.message));
  const login = async (page: any, username: string, password: string) => {
    await page.goto("http://127.0.0.1:5173"); await page.getByLabel("账号", { exact: true }).fill(username);
    await page.getByLabel("密码", { exact: true }).fill(password); await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("button", { name: "退出登录" }).waitFor();
  };
  await adminPage.goto("http://127.0.0.1:5173"); await adminPage.getByRole("heading", { name: "登录声息" }).waitFor();
  await adminPage.screenshot({ path: resolve(output, "login-desktop.png"), fullPage: true });
  await login(adminPage, "lenox", "Fixture-admin-pass");
  await adminPage.getByRole("button", { name: "创建用户", exact: true }).click();
  const dialog = adminPage.getByRole("dialog"); await dialog.getByLabel("账号", { exact: true }).fill("browser-a");
  await dialog.getByRole("button", { name: "创建用户", exact: true }).click();
  await dialog.getByLabel("新密码", { exact: true }).waitFor(); const issued = await dialog.getByLabel("新密码", { exact: true }).inputValue();
  assert.equal(issued.length, 12); await dialog.getByRole("button", { name: "已保存，关闭" }).click();
  await adminPage.getByRole("button", { name: /browser-a/ }).click();
  await adminPage.getByRole("checkbox", { name: /共享人物/ }).check(); await adminPage.getByRole("checkbox", { name: /第二人物/ }).check();
  await adminPage.getByRole("button", { name: /分配所选人物/ }).click();
  await adminPage.getByRole("button", { name: "专属设定", exact: true }).first().click();
  await dialog.getByLabel("向该用户显示的人物名称").fill("A 的老师");
  await dialog.getByLabel("关系与称呼").fill("老师与学生"); await dialog.getByLabel("提示词与人物设定").fill("A 独立提示词：耐心解释问题。");
  await dialog.getByRole("button", { name: "保存专属设定" }).click(); await dialog.waitFor({ state: "hidden" });
  await adminPage.getByText("A 的老师", { exact: true }).waitFor();
  await adminPage.screenshot({ path: resolve(output, "admin-users.png"), fullPage: true });
  await login(userPage, "browser-a", issued); await userPage.getByRole("heading", { name: "A 的老师", exact: true }).waitFor();
  assert.equal(await userPage.getByRole("button", { name: "视频通话", exact: true }).count(), 2);
  assert.equal(await userPage.getByRole("button", { name: "角色设定", exact: true }).count(), 0);
  assert.equal(await userPage.getByRole("checkbox").count(), 0);
  await userPage.screenshot({ path: resolve(output, "user-avatars.png"), fullPage: true });
  await userPage.getByRole("button", { name: "视频通话", exact: true }).first().click();
  assert.equal(await userPage.locator("iframe").count(), 0); assert.equal(fixture.upstreams.length, 0);
  await userPage.screenshot({ path: resolve(output, "call-waiting.png"), fullPage: true });
  // Leave waiting page without acquiring the mock media renderer.
  await userPage.goto("http://127.0.0.1:5173"); await userPage.getByRole("heading", { name: "A 的老师", exact: true }).waitFor();
  const adminCookie = await fixture.login("lenox", "Fixture-admin-pass");
  const users = await (await fixture.api("/api/admin/users", "GET", undefined, adminCookie)).json();
  const user = users.users.find((u: { username: string }) => u.username === "browser-a");
  await fixture.api(`/api/admin/users/${user.id}/avatars/${fixture.ids[0]}`, "DELETE", undefined, adminCookie);
  await userPage.getByRole("heading", { name: "A 的老师", exact: true }).waitFor({ state: "hidden" });
  await fixture.api(`/api/admin/users/${user.id}/password-reset`, "POST", { password: "Reset-browser-pass" }, adminCookie);
  await userPage.getByRole("heading", { name: "登录声息" }).waitFor({ timeout: 10_000 });
  await userPage.setViewportSize({ width: 390, height: 844 }); await userPage.screenshot({ path: resolve(output, "login-mobile.png"), fullPage: true });
  await login(userPage, "browser-a", "Reset-browser-pass"); await userPage.getByRole("heading", { name: "第二人物", exact: true }).waitFor();
  const overflow = await userPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false); await userPage.screenshot({ path: resolve(output, "user-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed: true, generatedPasswordLength: 12, independentBrowserContexts: 2,
    checks: ["Vite private-file denial including raw/url/import", "admin login", "create user", "multi-avatar assignment", "independent profile", "user-only controls", "waiting page no upstream", "revoke one assignment", "reset forces re-login", "390px no overflow"], pageErrors: errors }, null, 2));
  console.log("Browser account verification passed; artifacts/account-verification contains screenshots and sanitized results.");
} finally {
  await browser?.close();
  if (web.exitCode === null) { web.kill(); await new Promise<void>(r => web.once("exit", () => r())); }
  await fixture.close();
}
