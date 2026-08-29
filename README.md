# 声息：AI Respawn Push-to-Talk Demo

这是一个本地、单用户、半双工的实时语音验证项目：在 Windows Chrome 中按住按钮说话，松开后由豆包 Realtime 3.0 流式返回语音并立即播放。

当前版本刻意不包含声音复刻、逝者真实资料、数字人、RAG、长期记忆、全双工、VAD、移动端或公网部署。

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

随后在 Chrome 打开 <http://127.0.0.1:5173/>。页面显示“已就绪”后，按住圆形按钮（或空格键）说话，松开提交。播放期间录音会锁定，避免串轮。

## 验证命令

```powershell
npm run check          # TypeScript 静态检查
npm test               # 离线协议、音频、状态机与脱敏测试
npm run build          # 生产浏览器构建
npm run devices        # 列出本机录放音设备
npm run capture:check  # 4 秒本地麦克风检查；不联网、不落盘
npm run probe          # 固定 WAV 直连供应商 Gate 1 探针
npm run gateway:probe  # 经浏览器网关协议往返固定 WAV
npm run ptt            # 5 轮本机 CLI 按住说话验证
```

真实麦克风输入不会写入文件。`artifacts/` 仅用于固定公开测试样本的探针回复，且已被 Git 忽略。

## 音频与协议

- 浏览器采集：单声道 Float32，经 AudioWorklet 降采样为 16 kHz PCM16。
- 输入帧：20 ms，320 samples，严格 640 bytes。
- 供应商输出：24 kHz、单声道、PCM16，以二进制帧转给浏览器。
- 播放：Web Audio 单调时间轴调度，禁止重叠；实际设备采样率由浏览器正确重采样。
- 会话：浏览器 WebSocket 与供应商 WebSocket 一一映射，限定 localhost Origin、状态转换、背压、超时和关闭清理。

详细契约见 [`docs/provider-contract.md`](docs/provider-contract.md)，状态机和 Gate 见 [`docs/architecture.md`](docs/architecture.md)。

## 测试样本与隐私

固定输入来自 Free Spoken Digit Dataset 的公开 `jackson` 说话人数字 0/1/2 样本，按 CC BY-SA 4.0 使用；来源与生成步骤记录在 [`fixtures/README.md`](fixtures/README.md)。不要把真实逝者录音、真实 API Key 或个人资料加入仓库、fixture 或日志。

## 已知限制

- 仅验证 Windows Chrome 与单用户 localhost。
- 麦克风首次使用需要浏览器授权。
- 当前采用 Push-to-Talk；模型说话期间不能插话。
- 没有公网 TLS、账户、持久化、并发隔离或费用面板。
- API 若返回 4xx，应先核对控制台开通状态、API Key 和协议版本，不要盲目重试。

## 停止与清理

在运行 `npm run dev` 的终端按 `Ctrl+C`。网关会关闭浏览器和供应商会话；无需保留时可删除被忽略的 `artifacts/` 探针输出。不要提交 `.env`。
