# 声息：AI Respawn Automatic Turn Demo

这是一个本地、单用户、半双工的实时语音验证项目：在 Windows Chrome 中自动监听用户说话，连续静音约 1.2 秒后由豆包 Realtime 3.0 流式返回语音并立即播放。

当前版本刻意不包含声音复刻、逝者真实资料、数字人、RAG、长期记忆、全双工、语义判停、移动端或公网部署。

## 启动

要求：Windows、Chrome、Node.js 24+，以及已开通的豆包实时语音 API Key。

```powershell
npm install
Copy-Item .env.example .env
```

在 `.env` 中填写 `DOUBAO_API_KEY`。密钥只由本地 Node 网关读取；`.env` 已被 Git 忽略，浏览器构建中不包含密钥或供应商鉴权头。

```powershell
npm run dev
```

随后在 Chrome 打开 <http://127.0.0.1:5173/>。允许麦克风权限后页面会在本地自动监听；检测到有效说话后才开启一轮上游音频，连续静音约 1.2 秒后自动提交。播放期间录音会锁定，避免串轮。

临时管理员图片规范化页面位于 <http://127.0.0.1:5173/normalize>，每次上传一张，显示任务状态和原图/规范图对比。包含嘴眼素材、动画制作及审查的完整流程使用独立角色服务；启动、串行批处理和安全默认值见 [`docs/role-resource-pipeline.md`](docs/role-resource-pipeline.md)。`ZENMUX_API_KEY`仅由服务端读取。

## 验证命令

```powershell
npm run check          # TypeScript 静态检查
npm test               # 离线协议、音频、状态机与脱敏测试
npm run build          # 生产浏览器构建
npm run devices        # 列出本机录放音设备
npm run capture:check  # 4 秒本地麦克风检查；不联网、不落盘
npm run probe          # 固定 WAV 直连供应商 Gate 1 探针
npm run gateway:probe  # 经浏览器网关协议往返固定 WAV
npm run ptt            # 5 轮本机 CLI 音频验证（诊断用）
npm run diagnostics    # 查看或筛选本地脱敏诊断日志
```

真实麦克风输入不会写入文件。`artifacts/` 仅用于固定公开测试样本的探针回复，且已被 Git 忽略。

## 诊断日志

网关、固定探针和 CLI 会在项目根目录 `logs/` 生成按日期滚动的 JSONL 诊断日志，默认保留最近 7 天。浏览器页面会显示本次会话的简短“诊断 ID”，发生问题时连同该 ID 一起反馈即可。v2 日志包含状态转换、阶段里程碑、阶段耗时、最后里程碑、provider `error.type/code/param`、event ID、关闭信息和音频计数；音频 delta 只累计字节/分片，不逐条写入。

```powershell
npm run diagnostics                         # 最近 50 条记录
npm run diagnostics -- --id=deadbeef        # 按诊断 ID 筛选
npm run diagnostics -- --tail=200           # 查看最近 200 条
npm run diagnostics -- --id=deadbeef --export=artifacts/diagnostics-export.jsonl
```

命令会先输出按会话/轮次聚合的时间线。若网关阶段期限触发，摘要会标记为 `phase_timeout`；若错误发生在 `listening` 且没有 `commit_sent`，摘要会标记为 `provider_error_before_commit_or_unbounded_listening`；坏行会列出文件和行号。

日志只包含会话/轮次事件、耗时、结构计数、错误上下文、供应商 event ID/Log ID 和关闭原因；不包含输入音频、输出音频、转写文本、模型文本、Base64、API Key 或完整请求/响应。`logs/` 已被 Git 忽略。

## 音频与协议

- 浏览器采集：单声道 Float32，经 AudioWorklet 降采样为 16 kHz PCM16。
- 输入帧：20 ms，320 samples，严格 640 bytes。
- 供应商输出：24 kHz、单声道、PCM16，以二进制帧转给浏览器。
- 播放：Web Audio 单调时间轴调度，禁止重叠；实际设备采样率由浏览器正确重采样。
- 会话：浏览器 WebSocket 与供应商 WebSocket 一一映射，限定 localhost Origin、状态转换、背压、阶段超时和关闭清理；有效语音确认前仅本地监听，不占用供应商轮次。

详细契约见 [`docs/provider-contract.md`](docs/provider-contract.md)，状态机和 Gate 见 [`docs/architecture.md`](docs/architecture.md)。

## 测试样本与隐私

固定输入来自 Free Spoken Digit Dataset 的公开 `jackson` 说话人数字 0/1/2 样本，按 CC BY-SA 4.0 使用；来源与生成步骤记录在 [`fixtures/README.md`](fixtures/README.md)。不要把真实逝者录音、真实 API Key 或个人资料加入仓库、fixture 或日志。

## 已知限制

- 仅验证 Windows Chrome 与单用户 localhost。
- 麦克风首次使用需要浏览器授权。
- 当前采用自动静音判停的半双工；本地检测到有效声音约 200 ms 后开始一轮并发送最多 500 ms 预录，连续静音 1.2 秒提交，单轮最长 30 秒；模型说话期间不能插话。
- 没有公网 TLS、账户、持久化、并发隔离或费用面板。
- API 若返回 4xx，应先核对控制台开通状态、API Key 和协议版本，不要盲目重试。

## 停止与清理

在运行 `npm run dev` 的终端按 `Ctrl+C`。网关会关闭浏览器和供应商会话；无需保留时可删除被忽略的 `artifacts/` 探针输出。不要提交 `.env`。
