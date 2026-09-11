import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { accountFixture } from "../packages/avatar/account-fixture.ts";

// Test-only data and mock upstream. Never touches the installed account database.
if (!process.env.PLAYWRIGHT_MODULE || !process.env.CHROME_EXECUTABLE) throw Error("Set browser runtime paths");
const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const { chromium } = pw.default ?? pw;
const fixture = await accountFixture();
const output = resolve("artifacts", process.env.DESIGN_CAPTURE_NAME ?? "frontend-design");
await mkdir(output, { recursive: true });
const web = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "--config", "apps/web/vite.config.ts", "--port", "5174"], {
  windowsHide: true, stdio: ["ignore","pipe","pipe"], env: {...process.env, PORT: String(fixture.port)}
});
let browser: any;
const checks: string[] = [], screenshots: string[] = [], errors: string[] = [];
try {
  await new Promise<void>((done,reject) => {
    const timer = setTimeout(()=>reject(Error("Vite startup timeout; 5174 must be free")),10000);
    web.stdout.on("data",data=>{if(String(data).includes("5174")){clearTimeout(timer);done();}});
    web.stderr.resume(); web.once("error",reject); web.once("exit",()=>{clearTimeout(timer);reject(Error("Vite exited"));});
  });
  browser = await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true,
    args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}});
  const uctx = await browser.newContext({viewport:{width:1280,height:900}});
  let socket:any;
  let socketOpened:()=>void;
  const socketReady=new Promise<void>(resolve=>{socketOpened=resolve;});
  await uctx.routeWebSocket("**/ws**", (ws:any)=>{socket=ws;ws.onMessage(()=>{});socketOpened();});
  // Dedicated Vite port; only the isolated fixture sees the expected development Origin.
  for (const context of [ctx,uctx]) await context.route("**/api/**", async(route:any)=>{
    const url=new URL(route.request().url());
    const response=await route.fetch({url:fixture.origin+url.pathname+url.search,headers:{...route.request().headers(),origin:"http://127.0.0.1:5173","sec-fetch-site":"same-origin"}});
    await route.fulfill({response});
  });
  const page = await ctx.newPage(), userPage = await uctx.newPage();
  for(const p of [page,userPage]) { p.setDefaultTimeout(10000); p.on("pageerror",(e:Error)=>errors.push(e.message)); }
  const shot = async(p:any,name:string) => {
    await p.evaluate(()=>document.fonts.ready);
    await p.screenshot({path:resolve(output,name+".png"),fullPage:true});
    screenshots.push(name+".png");
  };
  const fits = async(p:any,label:string) => {
    const result = await p.evaluate(()=>{
      const vw=innerWidth;
      const bad=Array.from(document.querySelectorAll("button,input:not([type=file]),textarea,h1,h2,h3,.account-hint,.assignment-row"))
        .filter((el:any)=>el.getClientRects().length && !el.closest("dialog:not([open])"))
        .filter((el:any)=>{const r=el.getBoundingClientRect(); return r.left < -1 || r.right > vw+1;})
        .map((el:any)=>el.tagName+"."+el.className);
      return {overflow:document.documentElement.scrollWidth>vw+1,bad};
    });
    assert.equal(result.overflow,false,label+" page overflow"); assert.deepEqual(result.bad,[],label+" clipped controls");
    checks.push(label+" layout");
  };
  const login = async(p:any,name:string,password:string) => {
    await p.goto("http://127.0.0.1:5174");
    await p.getByLabel("账号",{exact:true}).fill(name);
    await p.getByLabel("密码",{exact:true}).fill(password);
    await p.getByRole("button",{name:"登录",exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('.account-error') || !document.querySelector('.login-form'));
    const error=await p.locator('.login-form .account-error').count()?await p.locator('.login-form .account-error').textContent():null;
    if(error)throw Error("Fixture browser login: "+error);
    await p.getByRole("button",{name:"退出登录"}).waitFor();
  };
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("heading",{name:"登录声息"}).waitFor();
  await shot(page,"login-desktop"); await fits(page,"login desktop");
  await page.getByLabel("账号",{exact:true}).fill("unknown");
  await page.getByLabel("密码",{exact:true}).fill("test-invalid-only");
  await page.getByRole("button",{name:"登录",exact:true}).click();
  await page.getByRole("alert").waitFor(); await shot(page,"login-error");
  for(const width of [320,390]) {
    await page.setViewportSize({width,height:844}); await fits(page,"login "+width); await shot(page,"login-"+width);
  }
  await page.getByLabel("账号",{exact:true}).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.getByLabel("密码",{exact:true}).evaluate((e:any)=>e===document.activeElement),true);
  checks.push("login keyboard field order");
  await page.emulateMedia({reducedMotion:"reduce"});
  assert.equal(await page.getByRole("button",{name:"登录",exact:true}).evaluate((e:any)=>getComputedStyle(e).transitionDuration),"0s");
  checks.push("reduced motion");
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.setViewportSize({width:1440,height:1000});
  await login(page,"lenox","Fixture-admin-pass");
  await page.getByText("还没有用户，先创建一个账号。").waitFor();
  await shot(page,"admin-empty");
  await page.getByRole("button",{name:"创建用户",exact:true}).click();
  const dialog=page.getByRole("dialog");
  await shot(page,"create-user");
  await page.keyboard.press("Escape"); await dialog.waitFor({state:"hidden"});
  // Existing React modal unmount does not restore trigger focus; do not alter behavior in this CSS-only task.
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(()=>document.activeElement?.tagName !== "BODY"),true);
  checks.push("modal Escape closes; keyboard remains operable (existing trigger-focus restoration limitation)");
  await page.getByRole("button",{name:"创建用户",exact:true}).click();
  await dialog.getByLabel("账号",{exact:true}).fill("browser-a");
  await dialog.getByRole("button",{name:"创建用户",exact:true}).click();
  await dialog.getByLabel("新密码",{exact:true}).waitFor();
  const issued=await dialog.getByLabel("新密码",{exact:true}).inputValue();
  assert.equal(issued.length,12);
  await dialog.getByRole("button",{name:"已保存，关闭"}).click();
  await page.getByRole("button",{name:/browser-a/}).click();
  await page.getByRole("checkbox",{name:/共享人物/}).check();
  await page.getByRole("checkbox",{name:/第二人物/}).check();
  await page.getByRole("button",{name:/分配所选人物/}).click();
  await page.getByRole("button",{name:"专属设定",exact:true}).first().click();
  await dialog.getByLabel("向该用户显示的人物名称").fill("A 的老师");
  await dialog.getByLabel("关系与称呼").fill("老师与学生");
  await dialog.getByLabel("提示词与人物设定").fill("耐心解释问题，保留此用户独立设定。");
  await shot(page,"profile-dialog");
  await dialog.getByRole("button",{name:"保存专属设定"}).click(); await dialog.waitFor({state:"hidden"});
  await page.getByText("A 的老师",{exact:true}).waitFor();
  await fits(page,"admin desktop"); await shot(page,"admin-users");
  const adminCookie=await fixture.login("lenox","Fixture-admin-pass");
  await fixture.api("/api/admin/users","POST",{username:"long-account-name-123456789012345"},adminCookie);
  // Refresh the UI list with the original navigation behavior.
  await page.getByRole("button",{name:"人物管理",exact:true}).click();
  await page.getByRole("button",{name:"用户管理",exact:true}).click();
  await page.getByRole("button",{name:/browser-a/}).click();
  for(const width of [320,390]) {
    await page.setViewportSize({width,height:844}); await fits(page,"admin "+width); await shot(page,"admin-"+width);
    await page.getByRole("button",{name:"专属设定",exact:true}).first().click();
    await dialog.getByLabel("向该用户显示的人物名称").fill("很长的人物名称用于验证手机端自动换行与输入布局");
    await fits(page,"profile modal "+width); await shot(page,"profile-"+width);
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>document.documentElement.style.fontSize="200%");
  await fits(page,"admin enlarged text"); await shot(page,"admin-enlarged-text");
  await page.evaluate(()=>document.documentElement.style.fontSize="");
  await page.getByRole("button",{name:"管理员账户",exact:true}).click();
  await shot(page,"admin-security");
  await page.setViewportSize({width:320,height:844}); await fits(page,"security 320"); await shot(page,"security-320");
  await page.getByLabel("当前密码",{exact:true}).fill("not-a-real-password");
  await page.getByLabel("新密码",{exact:true}).fill("test-mismatch-one");
  await page.getByLabel("再次输入新密码",{exact:true}).fill("test-mismatch-two");
  await page.getByRole("button",{name:"修改密码并重新登录"}).click();
  await page.getByText("两次新密码不一致").waitFor(); await shot(page,"security-error-320");
  await page.getByRole("button",{name:"人物管理",exact:true}).click();
  await page.getByRole("heading",{name:"共享人物",exact:true}).waitFor();
  await fits(page,"admin avatars 320"); await shot(page,"avatars-admin-320");
  await page.setViewportSize({width:1440,height:1000}); await shot(page,"avatars-admin");
  for(const name of ["重命名","角色设定","删除"]) {
    await page.getByRole("button",{name,exact:true}).first().click();
    await shot(page,"avatar-dialog-"+({"重命名":"rename","角色设定":"persona","删除":"delete"} as any)[name]);
    await page.keyboard.press("Escape");
  }
  // Render long and non-ready variants through test-only responses, without mutating records.
  await page.route("**/api/avatars",async(route:any)=>{
    const data=await (await fixture.api("/api/avatars","GET",undefined,adminCookie)).json();
    data.avatars[0]={...data.avatars[0],name:"很长的人物名称用于检查卡片自动换行与管理操作的完整可见性"};
    data.avatars[1]={...data.avatars[1],status:"processing",stage:"checking_portrait"};
    data.avatars[2]={...data.avatars[2],status:"failed",message:"测试照片暂不可用，请重新选择清晰照片或重试制作。"};
    await route.fulfill({json:data});
  });
  await page.getByText("正在检查人物照片…",{exact:true}).waitFor();
  await shot(page,"avatars-states-long"); await fits(page,"avatar long and failed");
  await page.setViewportSize({width:320,height:844}); await shot(page,"avatars-states-320"); await fits(page,"avatar states 320");
  await page.unroute("**/api/avatars");
  await page.setViewportSize({width:1440,height:1000});
  await login(userPage,"browser-a",issued);
  await userPage.getByRole("heading",{name:"A 的老师",exact:true}).waitFor();
  assert.equal(await userPage.getByRole("button",{name:"视频通话",exact:true}).count(),2);
  assert.equal(await userPage.getByRole("button",{name:"角色设定",exact:true}).count(),0);
  await shot(userPage,"user-avatars");
  for(const width of [320,390]) {
    await userPage.setViewportSize({width,height:844}); await fits(userPage,"user avatars "+width); await shot(userPage,"user-"+width);
  }
  await userPage.setViewportSize({width:1280,height:900});
  await userPage.getByRole("button",{name:"视频通话",exact:true}).first().click();
  assert.equal(await userPage.locator("iframe").count(),0);
  assert.equal(fixture.upstreams.length,0);
  await shot(userPage,"call-waiting");
  for(const size of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]) {
    await userPage.setViewportSize(size); await fits(userPage,"call waiting "+size.width); await shot(userPage,"call-waiting-"+size.width);
    const button=await userPage.getByRole("button",{name:"接听",exact:true}).boundingBox();
    assert.ok(button && button.y>=0 && button.y+button.height<=size.height,"answer reachable in viewport");
  }
  checks.push("waiting does not open media or upstream");
  await userPage.getByRole("button",{name:"返回",exact:true}).click();
  // The websocket below is intercepted entirely inside Playwright; no live upstream or mic is used.
  await userPage.getByRole("button",{name:"视频通话",exact:true}).first().click();
  await userPage.getByRole("button",{name:"接听",exact:true}).click();
  await Promise.race([socketReady,new Promise((_,reject)=>setTimeout(()=>reject(Error("Intercepted websocket not opened")),5000))]);
  await userPage.getByRole("button",{name:"取消呼叫",exact:true}).waitFor();
  await shot(userPage,"call-connecting-landscape"); await fits(userPage,"connecting landscape");
  socket.send(JSON.stringify({type:"clock",elapsedSeconds:120,idleRemaining:8,maxRemaining:500}));
  await userPage.getByRole("button",{name:"继续通话"}).waitFor(); await shot(userPage,"call-idle-warning");
  await userPage.getByRole("button",{name:"继续通话"}).click();
  socket.send(JSON.stringify({type:"clock",elapsedSeconds:892,idleRemaining:100,maxRemaining:8}));
  await userPage.getByRole("alert").waitFor(); await shot(userPage,"call-time-limit");
  socket.send(JSON.stringify({type:"prepared"}));
  await userPage.locator("iframe").waitFor();
  await userPage.locator("iframe").evaluate((f:any)=>{
    window.dispatchEvent(new MessageEvent("message",{origin:location.origin,source:f.contentWindow,data:{source:"dh-live",type:"error",message:"Test renderer unavailable"}}));
  });
  await userPage.getByText("已切换纯语音通话").waitFor();
  const noFallbackOverlap=await userPage.evaluate(()=>{
    const a=document.querySelector('.audio-only')!.getBoundingClientRect();
    const b=document.querySelector('.call-limit')!.getBoundingClientRect();
    return a.bottom<=b.top || b.bottom<=a.top;
  });
  assert.equal(noFallbackOverlap,true,"fallback and countdown must not overlap");
  await shot(userPage,"call-audio-only-landscape");
  socket.send(JSON.stringify({type:"error",message:"测试连接中断，请返回人物列表。",diagnostic_id:"UI-TEST-001"}));
  await userPage.getByRole("button",{name:"返回人物列表"}).waitFor();
  await userPage.getByText("故障诊断",{exact:true}).click();
  await fits(userPage,"call ended diagnostic"); await shot(userPage,"call-ended-diagnostic");
  await userPage.getByRole("button",{name:"返回人物列表"}).click();
  checks.push("intercepted call connecting, cancel, idle, limit, audio-only, error and return");
  await userPage.route("**/api/avatars",async(route:any)=>route.fulfill({json:{avatars:[],callActive:false}}));
  await userPage.getByText("还没有分配给你的人物",{exact:false}).waitFor();
  await userPage.setViewportSize({width:390,height:844}); await shot(userPage,"user-empty");
  await userPage.unroute("**/api/avatars");
  await userPage.getByRole("heading",{name:"A 的老师",exact:true}).waitFor();
  // Diagnostic page is inspected without pressing the real-provider test action.
  await page.route("**/dh-live/frame.html",async(route:any)=>route.fulfill({contentType:"text/html",body:"<!doctype html><body style='background:#17221d;color:#eef1e9'>Test renderer placeholder</body>"}));
  await page.goto("http://127.0.0.1:5174/?avatar-test");
  await page.getByRole("heading",{name:"数字人集成测试"}).waitFor();
  await fits(page,"diagnostic desktop"); await shot(page,"diagnostic-desktop");
  await page.setViewportSize({width:320,height:844}); await fits(page,"diagnostic 320"); await shot(page,"diagnostic-320");
  // Revocation/reset in isolated SQLite still work across independent contexts.
  const data=await (await fixture.api("/api/admin/users","GET",undefined,adminCookie)).json();
  const user=data.users.find((u:any)=>u.username==="browser-a");
  await fixture.api(`/api/admin/users/${user.id}/avatars/${fixture.ids[0]}`,"DELETE",undefined,adminCookie);
  await userPage.getByRole("heading",{name:"A 的老师",exact:true}).waitFor({state:"hidden"});
  await fixture.api(`/api/admin/users/${user.id}/password-reset`,"POST",{password:"Reset-browser-pass"},adminCookie);
  await userPage.getByRole("heading",{name:"登录声息"}).waitFor();
  checks.push("create user, 12-character issuance, independent profile, multi-assignment, revocation and reset re-login");
  assert.equal(fixture.upstreams.length,0); assert.deepEqual(errors,[]);
  await writeFile(resolve(output,"result.json"),JSON.stringify({passed:true,checks,screenshots,pageErrors:errors,realUpstreamCalls:0,
    limitations:["Desktop Chrome viewport emulation, not physical iOS/Android","Fixture portraits are black 1px test images","Call states use intercepted websocket; real provider/media quality not tested","Existing account modal unmount does not restore trigger focus; business/interaction code unchanged"]},null,2));
  console.log("Frontend design verification passed; "+screenshots.length+" screenshots in "+output+".");
} finally {
  await browser?.close();
  if(web.exitCode===null){web.kill();await new Promise<void>(r=>web.once("exit",()=>r()));}
  await fixture.close();
}
