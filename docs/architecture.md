# AI Respawn PTT Demo Architecture

状态：Gate 0 规格基线。

## 当前目标

在 Windows Chrome 上完成单用户、半双工 Push-to-Talk：按住期间发送 16 kHz PCM，松开强制判停，豆包 Realtime 3.0 返回 24 kHz PCM，浏览器立即连续播放。

## 组件边界

```text
Browser (no provider secret)
  AudioWorklet input  -> PCM16/16k/mono frames
  PTT state machine   -> local JSON events
  Playback scheduler  <- PCM16/24k/mono frames
            |
            | localhost WebSocket
            v
Node gateway
  browser session <-> Doubao session  (1:1)
  backpressure / timeout / cleanup
  redacted metrics
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
  web/                    # Gate 3: React/Vite PTT UI
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
  -> listening            (pointer down + unmute)
  -> committing           (pointer up/cancel + commit + mute)
  -> thinking             (input committed, no output audio yet)
  -> speaking             (first output audio delta)
  -> ready/muted          (audio done + response done)

any state -> error        (provider error, invalid transition, timeout)
any live state -> closing -> closed
```

硬规则：

- `session.created` 前不得发送音频。
- `listening` 之外不得发送非静音音频。
- 一次按下只能产生一次 commit；`pointercancel` 与 `pointerup` 语义相同。
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

- `connect_started_at` / `session_created_at`
- `ptt_down_at` / `ptt_up_at`
- 输入帧数、字节数、推算时长、峰值与静音比例
- `input_committed_at`
- `provider_audio_started_at` / `first_audio_delta_at`
- `browser_first_sound_at`
- `response_done_at`、返回字节数与推算时长
- provider `event_id` 与响应头 `X-Tt-Logid`；API Key 永不记录

松手到首声延迟拆为：

```text
provider first delta - ptt up
+ browser first sound - provider first delta
```

## Gate

- Gate 0：官方契约、密钥边界、状态机与验收阈值已固定。
- Gate 1：固定 WAV 连续 3 次得到合法 24 kHz PCM 回复并优雅关闭。
- Gate 2：本机麦克风/扬声器连续 5 轮无明显音频错误。
- Gate 3：浏览器、网关和 provider 形成安全闭环。
- Gate 4：离线测试通过，10 轮至少 9 轮成功，P95 首声不高于 3 秒。

Gate 1 未通过前，不创建依赖真实 provider 行为的麦克风、浏览器或网关实现。
