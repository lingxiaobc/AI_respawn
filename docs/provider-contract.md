# 豆包 Realtime 3.0 Provider Contract

状态：Gate 0 已核对；真实账号权限与握手待 Gate 1 验证。

核对日期：2026-08-29（Asia/Shanghai）

## 事实源

- [端到端实时语音 3.0 接入必读](https://www.volcengine.com/docs/6561/2549732?lang=zh)，页面最近更新时间：2026-08-21。
- [端到端实时语音-全双工版本](https://www.volcengine.com/docs/6561/2549778?lang=zh)，页面最近更新时间：2026-08-27。
- [产品简介](https://www.volcengine.com/docs/6561/1594360?lang=zh)，用于确认 S2S 产品定位，不作为协议字段来源。

若本文与执行日官方文档冲突，以官方文档为准，并先判断变化是否会改变计划范围、权限、验收或行动接口。

## 连接与鉴权

| 字段 | 当前值 | 来源与约束 |
| --- | --- | --- |
| WebSocket URL | `wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue` | 官方全双工 API 文档 |
| Request Header | `X-Api-Key: <secret>` | 新版控制台的唯一必填鉴权头；Key 从“控制台 > API Key 管理”获取 |
| Model | `1.2.6.1` | `session.model` 固定值 |
| Secret env | `DOUBAO_API_KEY` | 本项目约定；只允许存在于未跟踪的 `.env` |

旧版 `APP_ID + Access Key + Resource ID + App Key` 属于历史鉴权路线，不在本 adapter 中混用。若用户账号只有旧版凭据，暂停 Gate 1 并根据官方“旧版控制台鉴权参考示例”新增独立 legacy adapter，不修改当前 adapter。

## 消息帧与音频契约

- 所有上下行事件都是一条完整 JSON 字符串，通过 WebSocket Text Message 收发。
- 每个上行事件携带唯一 `event_id`，用于与 `X-Tt-Logid` 一起排障。
- 输入：PCM、16,000 Hz、单声道、int16、小端序；音频字节 Base64 后放入 `input_audio_buffer.append.audio`。
- 推荐输入分包：20 ms，即每包 `16000 × 0.02 × 2 = 640` 字节。
- 输出：本 demo 显式请求 PCM、24,000 Hz、单声道、16 bit、小端序；Base64 数据位于 `response.output_audio.delta.delta`。
- 默认输出也可为 OGG-Opus，但第一版使用 PCM 以便离线核验、排队播放和样本计数。

## Push-to-Talk 事件顺序

```text
WebSocket open (X-Api-Key)
  -> session.create
  <- session.created
  -> input_audio_mute.commit          # 初始未采集，维持模型状态

pointer down
  -> input_audio_unmute.commit
  -> input_audio_buffer.append × N    # 640-byte PCM frames

pointer up / cancel
  -> input_audio_buffer.commit        # 强制判停，即原 EndASR
  -> input_audio_mute.commit
  <- input_audio_buffer.committed
  <- ASR / text delta events
  <- response.output_audio.started
  <- response.output_audio.delta × N
  <- response.output_audio.done
  <- response.done

shutdown
  -> session.close
  <- session.closed
  -> close WebSocket
```

模型依赖上行音频流保活。麦克风停止发送时必须显式发送 `input_audio_mute.commit`；恢复时发送 `input_audio_unmute.commit`。直接断开而未先完成 `session.close/session.closed` 会触发 `ContextCanceled`（官方文档列出的错误码 `55000001`）。

## 最小 session.create

```json
{
  "type": "session.create",
  "event_id": "event_<uuid>",
  "session": {
    "model": "1.2.6.1",
    "instructions": "你是一位温和、简洁的中文语音助手。每次回答不超过两句话。",
    "audio": {
      "input": { "format": { "type": "pcm", "rate": 16000 } },
      "output": {
        "format": { "type": "pcm", "rate": 24000 },
        "voice": "zh_female_vv_jupiter_bigtts",
        "speed": 0,
        "loudness": 0
      }
    }
  },
  "extension": { "asr": {}, "tts": {}, "dialog": {} }
}
```

## 下行事件最小处理集

| 事件 | 处理 |
| --- | --- |
| `session.created` | 记录脱敏 session id；解锁音频发送 |
| `input_audio_buffer.committed` | 标记用户本轮输入已被服务端接受 |
| `conversation.item.input_audio_transcription.*` | 仅记录文本/状态，不作为音频闭环的必要条件 |
| `response.output_text.delta/done` | 用于可观察调试 |
| `response.output_audio.started` | 记录首音频事件时间 |
| `response.output_audio.delta` | Base64 解码并按到达顺序追加到播放/文件队列 |
| `response.output_audio.done` | 封口本轮 PCM，并计算音频时长 |
| `response.done` | 记录用量和总轮次指标 |
| `session.closed` | 收到后才关闭底层 WebSocket |
| `error` | 4xx 停止重试并核对配置；5xx 允许受控重连 |

## Gate 1 前仍待用户完成

1. 在火山引擎新版豆包语音控制台确认实时语音 3.0 服务可用。
2. 在“API Key 管理”创建或选用一个 Key。
3. 将 Key 只写入仓库根目录 `.env`：`DOUBAO_API_KEY=...`。
4. 准备一段 16 kHz/单声道/PCM16 WAV 测试语音，或允许后续用本机麦克风录制并落盘一段明确的测试语音。

任何密钥值都不进入本文、聊天、日志、测试快照或 Git。
