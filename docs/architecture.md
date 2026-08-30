# AI Respawn Automatic Turn Demo Architecture

状态：Gate 0 规格基线。

## 当前目标

在 Windows Chrome 上完成单用户、半双工自动判停：麦克风由浏览器本地监听，确认有效讲话后才向网关发送最多 500 ms 预录和后续 16 kHz PCM；连续静音 1200 ms 自动提交，豆包 Realtime 3.0 返回 24 kHz PCM，浏览器立即连续播放。

## 组件边界

```text
Browser (no provider secret)
  AudioWorklet input  -> PCM16/16k/mono frames
  turn detector      -> speech/silence/commit events
  Playback scheduler  <- PCM16/24k/mono frames
            |
            | localhost WebSocket
            v
Node gateway
  browser session <-> Doubao session  (1:1)
  backpressure / timeout / cleanup
  redacted JSONL diagnostics
            |
            | WSS + X-Api-Key
            v
Doubao Realtime 3.0 provider adapter
```

固定样本探针与浏览器网关必须复用同一个 `packages/provider-doubao` adapter，避免出现“CLI 能通、网页协议另写一套”的漂移。

## 项目目录

```text
apps/
  server/                 # Gate 3: browser gateway
  web/                    # Gate 3: React/Vite automatic-turn UI
packages/
  audio/                  # WAV/PCM validation, framing, playback math
  provider-doubao/        # Current provider protocol only
  protocol/               # Gate 3: browser <-> gateway events
scripts/
  probe.ts                # Gate 1 fixed-fixture real provider probe
fixtures/
  input/                  # explicitly approved artificial/test audio only
docs/
  provider-contract.md
  architecture.md
TASK/                     # approved plan + tracker
```

## 会话状态机

```text
idle
  -> connecting
  -> ready/muted
  -> initializing        (request microphone + AudioContext)
  -> listening            (automatic ptt.start + unmute)
  -> committing           (valid speech + 1200 ms silence + commit + mute)
  -> thinking             (input committed, no output audio yet)
  -> speaking             (first output audio delta)
  -> ready/muted          (audio done + response done)

any state -> error        (provider error, invalid transition, timeout)
any live state -> closing -> closed
```

硬规则：

- `session.created` 前不得发送音频。
- `listening` 之外不得向网关发送上游音频；本地 `ready` 阶段只保留有限预录，不占用 provider 轮次。
- 初始静音不能产生 commit；有效声音需持续约 200 ms 才开始一轮。
- 语音开始时先发送 `ptt.start`，再按时间顺序发送预录和实时帧；静音等待期间只在本地判停，恢复讲话会取消待提交计时。
- 每轮最多持续 30 秒；达到上限时提交并回到模型回复。
- `speaking` 期间第一版禁止开始新一轮录音。
- 关闭前必须等待 `session.closed`；超时只允许记录并强制清理本地资源。

## 音频契约

| 边界 | 格式 | 帧/队列 |
| --- | --- | --- |
| Browser capture -> gateway | PCM16 LE, mono, 16 kHz | 20 ms / 640 bytes |
| Gateway -> Doubao | Base64 inside JSON text frame | 保持输入顺序；不并行发送 |
| Doubao -> provider adapter | observed Float32LE delta → canonical PCM16LE | 按 `delta` 到达顺序；尾部和非法样本显式失败 |
| Gateway -> Browser | Binary canonical PCM16 payload + JSON lifecycle events | 每会话独立队列 |
| Browser playback | Float32 scheduled at 24 kHz logical timeline | 单调时钟，禁止重叠与串轮 |

## 可观察指标

- 诊断日志事件：`session_started`、`state_transition`、`round_started`、`milestone`、`provider_event`、`round_completed`、`round_aborted`、`error`、`session_closed`
- 每条记录：ISO 时间、组件、`diagnostic_id`、`session_id`、轮次、状态、状态转换、阶段耗时和最后里程碑
- 轮次摘要：输入帧/字节数、输出分片/字节数、provider 事件计数、ASR 完成状态、提交到首声和轮次总耗时、最近音频空闲时长
- 错误上下文：阶段、脱敏错误码/消息、provider `event_id`/事件类型、嵌套 `error.type/code/param`、可得的 `X-Tt-Logid`、HTTP 状态、关闭码/原因和 deadline
- 不记录输入/输出音频、转写正文、模型正文、Base64、API Key 或完整请求/响应

日志写入项目根目录 `logs/diagnostics-YYYY-MM-DD.jsonl`，当前 schema 版本为 2，默认保留 7 天；写入、滚动或清理失败只降级到 stderr，不阻断会话主链路。`npm run diagnostics -- --id=<诊断 ID>` 会输出轮次时间线、缺失里程碑和候选故障层。

判停到首声延迟拆为：

```text
provider first delta - turn commit
+ browser first sound - provider first delta
```

### 超时诊断

本地 `ready` 阶段不会创建 provider round。检测到约 200 ms 有效语音后，浏览器发送 `ptt.start` 并 flush 最多 500 ms 预录；网关为 `listening`、`thinking`、`speaking` 分别设置期限。若发生错误，优先查看 `last_milestone`：`UPSTREAM_PHASE_TIMEOUT` 表示网关阶段期限到期；没有 `commit_sent` 的其他 `listening` 错误表示输入轮次未提交，不应先归因于模型生成或联网搜索。

## Gate

- Gate 0：官方契约、密钥边界、状态机与验收阈值已固定。
- Gate 1：固定 WAV 连续 3 次得到合法 24 kHz PCM 回复并优雅关闭。
- Gate 2：本机麦克风/扬声器连续 5 轮无明显音频错误。
- Gate 3：浏览器、网关和 provider 形成安全闭环。
- Gate 4：离线测试通过，10 轮至少 9 轮成功，P95 首声不高于 3 秒。

Gate 1 未通过前，不创建依赖真实 provider 行为的麦克风、浏览器或网关实现。
