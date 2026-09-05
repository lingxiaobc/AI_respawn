# ZenMux 生图断连与响应误报复盘

日期：2026-09-05。时间线统一使用北京时间（UTC+8），原始账本为UTC。

## 1. 状态与范围

本次已修复：非流式响应读取/JSON解析失败被转换为“缺少图片字段”的错误分类问题，并增加失败阶段、HTTP状态、耗时和安全错误码。

未解决/未证实：历史连接为何被断开、断开方是本机网络组件、代理、中间网关还是ZenMux入口。修复错误报告不等于修复网络链路；最新四次流式成功不等于历史根因已排除。

本次只修改共享供应商客户端和本文档；没有付费生图、修改代理、改变API协议默认值、提高预算、增加自动重试、部署或提交。历史失败账本和生成图片原样保留。

## 2. 用户影响

平台可能已经生成并计费，但客户端没有取得完整响应，任务显示失败或完成状态未知。误报会把排查方向引向图片字段/上传格式，掩盖实际的响应体读取失败；贸然重新生成还可能重复计费。

用户曾提供ZenMux后台生成成功截图。截图证明平台保存了生成结果，不能证明客户端实际收到了全部结果，也没有足够关联字段将截图与每条本地账本一一确定绑定。

## 3. 已核对的历史证据

账本目录：`AI_output/motion/.calls/`。以下ID为本地调用ID，不是供应商request ID。

| 时间/事件 | 原始证据 | 可得出的结论 |
| --- | --- | --- |
| 最早嘴半张失败 | `674a3f21bfb0095fcc53a8429a48aa515b0a589f66895b6fad37239dd5d74302.json`；只有`fetch failed` | 原始日志不足，无法精确归因；不能以之后的错误替代本次证据 |
| 9月4日首次授权替换失败 | 同一ID加`-approved-replacement-1.json`；`fetch failed (UND_ERR_SOCKET)`；任务记录记载58.77秒 | 底层socket异常；时长来自任务记录，账本自身没有阶段时间 |
| 9月4日16:50:14.936–16:50:19.990 | 同一ID加`-approved-replacement-2.json`；5.054秒；`ECONNRESET`；`Client network socket disconnected before secure TLS connection was established` | TLS建立前断开，尚未进入正常HTTPS图片请求/响应阶段 |
| 9月4日17:12:31.514–17:14:18.177 | 同一ID加`-approved-replacement-3.json`；非流式；上传结束17:12:31.706，响应头17:14:11.444，HTTP200 JSON，输出1,941,574字节且PNG校验通过 | 原有multipart上传及非流式Base64接收路径可以完整成功；输入PNG2,056,911字节，总请求体2,058,420字节 |
| 9月4日17:24:12.448–17:25:03.024 | `93ae4c0b3953e19d0a236ceb5acc7b1b8cd7dbb55b4a9192c0de4af1c90b976d.json`；50.576秒；`fetch failed (UND_ERR_SOCKET)` | 按所核对客户端代码路径，错误来自等待fetch响应，而不是后续文件保存；未记录实际收到的字节数，不能推断物理层完全未收到任何字节 |
| 9月5日09:34:59–09:41:52 | youth-v2四态对应账本`d35200…`、`541f26…`、`b6f85d…`、`41dfed…`均succeeded；执行记录使用`--stream` | 四次最新流式调用成功，不构成同条件A/B试验，不能证明流式是唯一成功原因 |

最初规范化任务记录在`AI_output/normalized/.jobs/`：

- `ee7ca039-d2f5-4b42-938d-dd03472aa73f.json`：98.628秒。
- `1e7701f4-6d80-43ce-afe7-e8d193f14b41.json`：99.171秒。
- `b2e7349e-1280-4810-9ee4-78b3b94e317b.json`：104.850秒。

这些任务均成功。旧资源成功请求106.663秒，时长相近；没有证据支持“资源生成明显更慢，因此触发本地180秒超时”。50.576秒socket失败也不是达到该应用超时阈值的证据。

输入规范化与局部资源生成共用`packages/image-normalization/src/zenmux.ts`：`normalize()`直接调用`edit()`，同一multipart和`/images/edits`路径。身份/表情提示词不同，不等于上传协议不同。

## 4. 确定的代码Bug及定位

文件：`packages/image-normalization/src/zenmux.ts`，`ZenMuxImageProvider.edit()`，旧版第74行附近（以后以代码语句定位，不依赖行号）。

原代码：

```ts
const payload = await response.json().catch(() => ({})) as ZenMuxResponse;
const encoded = payload.data?.[0]?.b64_json;
if (!encoded) throw new Error("ZenMux response did not contain data[0].b64_json");
```

因果链：

1. `fetch()`先成功返回Response，表示应用已经取得响应头。
2. `response.json()`还需要读取完整响应体并解析JSON；两步任何一步都可能失败。
3. 无条件catch把读取中断、坏JSON等异常都转换为空对象，丢失错误原因。
4. 空对象当然没有`data[0].b64_json`，因此抛出误导性的字段缺失错误。
5. 原有外层错误处理只取嵌套cause.code，且不记录阶段/HTTP状态/耗时，进一步损失定位信息。

这属于错误处理Bug，而不是已证实的图片数据被程序丢弃。历史嘴张开账本实际是`fetch failed`，不是“缺少字段”；因此不能把本地模拟证明的Bug反向认定为该历史请求失败的直接原因。

## 5. 本地复现证据

诊断时注入假的fetch，不读取密钥、不调用平台：

| 故障注入 | 修复前结果 | 修复后分类 |
| --- | --- | --- |
| fetch取得响应头前抛出socket异常 | `fetch failed (UND_ERR_SOCKET)` | `stage=request-awaiting-headers http=none`，保留安全错误码 |
| HTTP200响应体流读取时报socket异常 | 错报缺少`data[0].b64_json` | `stage=response-body http=200`及`UND_ERR_SOCKET`，不再报字段缺失 |
| HTTP200但JSON损坏 | 错报缺少图片字段 | `stage=response-json http=200`，明确JSON无效且不回显响应内容 |
| 合法JSON确实没有图片字段 | 字段缺失 | `stage=response-schema http=200`，保留真实字段缺失类别 |
| 正常JSON/Base64 | 解码成功 | 继续成功 |

另外测试了502 HTML错误页、429 JSON错误、JSON null、图片字段数字类型、应用超时、密钥脱敏及每次只调用一次。

## 6. 具体修复

1. 将非流式处理拆成`await response.text()`与独立`JSON.parse()`。读取失败直接到外层处理，不再制造空对象。
2. JSON解析异常改为固定说明，不携带原始SyntaxError文本；原始解析错误可能包含响应内容。
3. 分阶段记录：`request-awaiting-headers`、`response-metadata-callback`、`response-stream`、`response-body`、`response-json`、`response-schema`。
4. 每个失败说明添加`stage`、`http`、`elapsedMs`。`http=none`表示应用未取得HTTP状态，不等于对网络包数量的证明。
5. 同时识别直接`error.code`与`error.cause.code`，仅保留符合白名单格式的代码。
6. 检查图片字段必须是非空字符串，处理JSON null，不再让错误数据类型混入Base64转换。
7. 应用超时仍说明完成状态未知、没有重试，并保留超时所处阶段。
8. 所有外发错误继续精确移除配置密钥，过滤常见凭据/长二进制串，限制500字符。HTTP状态和阶段放在前面，避免后续截断丢失核心定位信息。

新的错误字符串会沿现有NormalizationQueue及donor catch进入任务错误记录；本次没有增加新的日志数据库，也没有修改历史账本。现有response回调和request ID行为保持不变。

边界：本次没有增加断线续传、结果查询或自动付费重试；没有声称修复TLS链路。SSE仍使用现有completed事件验证，只有partial或提前结束不能算成功。

## 7. 回归结果与复现方法

2026-09-05本次执行结果：

- 针对性内存故障注入：10/10通过；不联网、不写图片、不读取`.env`。
- `npm test`：现有59/59通过，含SSE、无自动重试、缓存损坏拒绝和密钥脱敏测试。
- `npm run check`：通过。
- `git diff --check`：通过。
- npm PowerShell启动脚本有用户目录访问警告，但测试/tsc实际执行并成功退出；不将警告当作未运行。

针对性10项是本次命令行验证，不冒充已加入npm自动测试。以下核心复现可从项目根目录通过Node执行（不调用平台）：

```js
// node --experimental-strip-types --input-type=module
// 将本段作为标准输入执行，或传入 -e；不需要环境密钥。
import assert from "node:assert/strict";
import { ZenMuxImageProvider } from "./packages/image-normalization/src/zenmux.ts";
const input = { pngBytes: Buffer.from([1]), sourceHash: "diagnostic", width: 1024, height: 1536 };
let calls = 0;
const provider = new ZenMuxImageProvider({
  apiKey: "diagnostic-not-a-real-key",
  fetchImpl: async () => {
    calls++;
    return new Response(new ReadableStream({
      start(controller) {
        controller.error(new TypeError("terminated", { cause: { code: "UND_ERR_SOCKET" } }));
      },
    }), { status: 200 });
  },
});
await assert.rejects(provider.edit(input, "test"), error => {
  assert.match(error.message, /stage=response-body/);
  assert.match(error.message, /http=200/);
  assert.match(error.message, /UND_ERR_SOCKET/);
  assert.doesNotMatch(error.message, /b64_json/);
  return true;
});
assert.equal(calls, 1);
console.log("PASS: interrupted response is not a missing-image error");
```

## 8. 误判与纠正记录

| 旧判断/容易出现的误报 | 为什么不足 | 本次纠正 |
| --- | --- | --- |
| “就是Clash代理的问题” | socket异常不包含断开责任方；代理日志相关不等于与该请求存在已证实因果关系 | 撤回确定归因，代理只是候选原因 |
| “都是Codex沙箱导致” | 用户独立PowerShell也复现过TLS失败；但最早失败日志又不足 | 不能统一归因沙箱，也不能据此宣布每次都与执行环境无关 |
| “上传方式不对” | 相同旧非流式路径已有完整成功记录 | 没有确定性上传协议Bug的证据 |
| “平台成功意味着客户端已收到图片” | 平台生成结果与下游HTTP交付是不同阶段 | 必须核对客户端接收及平台下游连接日志 |
| “最大口型生成不达标是网络问题” | 口型幅度属于生成效果；接收链路是不同维度 | 分开做视觉测量与传输诊断，不能混为一谈 |
| “流式成功就证明根因修好了” | 重试时间、提示词、超时配置和链路状态等不完全相同，非受控对照 | 只陈述四次成功，不宣称彻底修复 |
| 响应中断被报成“缺少图片字段” | 无条件catch吞掉读取/解析错误 | 本次代码修复并验证 |

## 9. 仍需证据及后续处置

要确定历史断开方，需要按北京时间失败窗口和可获得的供应商ID，核对ZenMux：请求接收时间、生成完成时间、向客户端首次写响应时间、发送字节数、连接关闭时间及原因。现有账本没有可靠的供应商request ID，不能凭空补写。

若以后再次失败：先保存新阶段错误和账本，确认是连接前、响应体还是格式问题；再关联平台下游日志。必要时在明确授权下增加专用传输观测或抓包，不能无授权读取代理凭据/完整配置。没有生成状态证据前，不删除失败账本、不自动重试，不假定失败请求未扣费。

参考：

- [Undici官方错误分类](https://github.com/nodejs/undici/blob/main/docs/docs/api/Errors.md)：SocketError不能单独指认断开方。
- [ZenMux图片编辑流式事件](https://zenmux.ai/docs/api/openai/image-edit-streaming-events.html)：流式事件协议。
- 本地历史任务记录：`TASK/stopped/portrait-motion-batch/TASK.md`。

最终结论：**已修复并验证响应误报Bug；已记录历史误判与证据；历史网络断连根因仍未定，不应登记为已根治。**
