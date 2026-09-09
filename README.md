# 声息：AI Respawn Automatic Turn Demo

这是一个本地、单用户、半双工的实时语音验证项目：在 Windows Chrome 中自动监听用户说话，连续静音约 1.2 秒后由豆包 Realtime 3.0 流式返回语音并立即播放。

当前分支支持每批上传 1—3 张照片，一图一角色，在本机依次制作 DH_live_mini 人物资源，再由豆包实时回复音频驱动嘴型。历史角色总数不设上限，SQLite 保存人物、任务与通话元数据。头部轮廓、颈部、身体和背景固定，只变化嘴部及其附近，不添加眨眼。浏览器本机运行 WASM，无需 GPU 服务器。当前为本机单用户原型，不含账号、管理员、声音复刻、RAG、长期记忆、全双工或公网部署。当前规则见 [批量人物与通话阶段](docs/BATCH_CALL_PHASE.md)，环境恢复见 [照片实时通话说明](docs/PHOTO_REALTIME_LOCAL.md)。

## 启动

要求：Windows、Chrome、Node.js 24+，以及已开通的豆包实时语音 API Key。

```powershell
npm install
# 仅当尚无 .env 时复制；已有配置不要覆盖。
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

在 `.env` 中填写 `DOUBAO_API_KEY`、`ZENMUX_API_KEY`、`IMAGE_MODEL_ID` 和 `ROLLBACK_MODEL`。新照片全部经 ZenMux 规范取景，保留原有表情、五官皱纹和背景，再在本地制作；主图片模型失败自动使用备用模型一次。密钥只由本地 Node 网关读取，浏览器和 Python 不接收密钥。详见[角色管理与照片规范化](docs/ROLE_MANAGEMENT_NORMALIZATION.md)。

```powershell
npm run dev
```

首次使用照片前，需将已验证的 `epoch_40_new.pth` 放到根目录，安装 Git 与 uv，然后运行 `npm run avatar:setup`。该命令在 `.cache/` 恢复固定上游版本、Python 3.12 与 CPU 处理依赖，不下载或修改你的照片；已有本机环境可复用。模型、缓存和生成资源不随 Git 同步。

随后在 Chrome 打开 <http://127.0.0.1:5173/>，选择 1—3 张照片并开始制作。一个角色成功即可进入通话页面，点击绿色接听按钮后正式通话；此时后台制作暂停，挂断后自动继续。每张失败不阻断其他照片，可单独重试，成功的标准照片会复用。角色卡片提供重命名、角色设定和软删除，删除仅归档且保留媒体。接听前不连接语音或使用麦克风；接听后只申请麦克风、不调用摄像头。有效说话后连续静音约 1.2 秒自动提交，AI 播放期间停止收音。挂断返回列表；意外退出的未完成任务显示中断，需手动重试。

网关默认端口为 `8877`，避免部分 Windows 系统保留的 `8787`。如需修改，在 `.env` 设置 `PORT`，重启 `npm run dev`，前端代理会读取同一配置。

## 验证命令

```powershell
npm run check          # TypeScript 静态检查
npm test               # 离线协议、音频、状态机与脱敏测试
npm run build          # 生产浏览器构建
npm run avatar:verify  # 固定人物和 WASM 资源完整性
npm run avatar:setup   # 首次恢复本机照片处理环境（需根目录权重）
npm run devices        # 列出本机录放音设备
npm run capture:check  # 4 秒本地麦克风检查；不联网、不落盘
npm run probe          # 固定 WAV 直连供应商 Gate 1 探针
npm run gateway:probe  # 经浏览器网关协议往返固定 WAV
npm run ptt            # 5 轮本机 CLI 音频验证（诊断用）
npm run diagnostics    # 查看或筛选本地脱敏诊断日志
```

真实麦克风输入不会写入文件。`artifacts/` 保存人物数据库、上传照片、标准图、嘴部资源以及测试与诊断产物，已被 Git 忽略；其中的人物资料需要保留和备份。

## 诊断日志

网关、固定探针和 CLI 会在项目根目录 `logs/` 生成按日期滚动的 JSONL 诊断日志；通话网关保留最近 30 天，独立诊断工具沿用各自默认期限。日志包含状态转换、阶段里程碑、阶段耗时、最后里程碑、provider `error.type/code/param`、event ID、关闭信息和音频计数；音频 delta 只累计字节/分片，不逐条写入。

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
- 数字人播放：24→16 kHz 连续降采样，以 320 ms WAV 分片交给同源 iframe 内的 WASM 和 Web Audio；音频逐片播放，整轮播放结束才回执。
- 纯语音播放：沿用 Web Audio 单调时间轴调度；实际设备采样率由浏览器重采样。
- 会话：浏览器 WebSocket 与供应商 WebSocket 一一映射，限定 localhost Origin、状态转换、背压、阶段超时和关闭清理；有效语音确认前仅本地监听，不占用供应商轮次。

详细契约见 [`docs/provider-contract.md`](docs/provider-contract.md)，状态机和 Gate 见 [`docs/architecture.md`](docs/architecture.md)。

## 测试样本与隐私

固定输入来自 Free Spoken Digit Dataset 的公开 `jackson` 说话人数字 0/1/2 样本，按 CC BY-SA 4.0 使用；来源与生成步骤记录在 [`fixtures/README.md`](fixtures/README.md)。不要把真实逝者录音、真实 API Key 或个人资料加入仓库、fixture 或日志。

## 已知限制

- 仅验证 Windows Chrome 与单用户 localhost。
- 麦克风首次使用需要浏览器授权。
- 当前采用自动静音判停的半双工；本地检测到有效声音约 200 ms 后开始一轮并发送最多 500 ms 预录，连续静音 1.2 秒提交，单轮最长 30 秒；模型说话期间不能插话。
- 人物和任务已持久化；不保存聊天正文、通话录音或跨场记忆。没有公网 TLS、账户、多用户或费用面板。
- API 若返回 4xx，应先核对控制台开通状态、API Key 和协议版本，不要盲目重试。

## 停止与清理

在运行 `npm run dev` 的终端按 `Ctrl+C`。网关会关闭会话与当前制作任务。`artifacts/avatars/` 包含人物数据库、上传原图和成功素材，需要保留；不要把整个 `artifacts/` 当作临时探针输出删除。备份或迁移人物时先停止服务，再完整复制 `artifacts/avatars/`。不要提交 `.env`。
