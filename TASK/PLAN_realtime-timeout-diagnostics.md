---
plan_schema: rumelt-task-plan/v2
plan_id: PT-realtime-timeout-diagnostics
plan_version: 1
status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05,S-06
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06,A-07,A-08,A-09,A-10
mode: full
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-07,M-08
---

# 任务方案：第 8 轮超时诊断与日志系统升级

## 任务事实与边界

- REQ-01 | 排查第 8 轮在 listening 状态约 55.7 秒后被上游错误中断的原因。
- REQ-02 | 优化日志，使大小故障都能定位到浏览器、网关、供应商协议、生成或播放阶段。
- REQ-03 | 修复无界等待链路，避免用户未形成有效语音时持续占用上游轮次。
- REQ-04 | 不加入联网搜索能力，不保存音频、转录、模型回复、Base64 或密钥。
- C-01 | 现有日志 `75057b2f` 在 2026-08-30 10:23:13.365Z 开始第 8 轮，10:24:09.063Z 在 listening 状态收到 `UPSTREAM_EVENT`；未记录嵌套供应商错误码。
- C-02 | `timeoutMs: 45_000` 当前只用于 provider 建连、等待 session.created/session.closed，不直接控制轮次 listening。
- C-03 | 浏览器当前在 listening 状态逐帧上送音频，并在本地检测到 200ms 语音后才进入 speaking；未检测到语音时没有硬上限。
- C-04 | 日志写入必须不阻塞主链路；禁止采集音频、文本、Base64、API Key 或完整请求/响应。
- C-05 | 修改范围限于本地工作区、localhost 验证和本地 `logs/`；不上传、不部署、不提交 Git。
- F-01 | 第 8 轮前 1–7 轮均成功；失败后新会话 `ec764939` 至少完成 6 轮，说明不是固定轮次、永久鉴权或必现配额故障。
- F-02 | 官方 Realtime 协议的错误细节位于 `error.type/code/message/param`，并提供 `input_audio_buffer.committed` 等阶段事件。
- F-03 | `safeEventSummary` 只读取顶层 `status_code`/`message`，网关因此把供应商错误降级为“Provider returned an error”。
- F-04 | `TurnDetector` 仅在达到有效语音后启动 30 秒最大轮时长；waiting 状态可无限持续。
- U-01 | 历史第 8 轮供应商具体错误码已不可恢复，只能通过增强后的日志复现确认。
- U-02 | 上游对长时间未 commit 音频流的精确超时阈值未在当前协议层暴露。
- U-03 | 真实浏览器长静音和连续多轮测试的稳定性需要执行后确认。
- ASM-01 | 第 8 轮的主因是本地轮次生命周期与有效语音边界错位，导致上游无界 waiting/未提交输入，约 55.7 秒后由供应商终止。
- ASM-02 | 只记录阶段、计时、计数、错误结构和关联 ID，足以定位当前故障而不需要保存内容。
- ASM-03 | 本地预录缓冲加“检测语音后才开启上游轮次”不会吞掉句首，并能消除无界上游等待。
- ASM-04 | 供应商错误后重建本地会话或明确进入可恢复错误态，比继续复用已被上游关闭的 socket 更安全。
- 可用输入/工具/权限 | 当前 TypeScript/Vite 工程、历史 JSONL、现有协议/音频测试、Node.js、本地服务与已授权的 localhost 浏览器/麦克风验证。

## 战略路由与模块选择

- 任务特征：不确定性高（历史错误码缺失）；依赖强（浏览器检测、网关状态、provider 事件、日志 schema 串行衔接）；可逆性混合（代码可回退，日志会本地留存）；范围跨 audio/browser/gateway/provider/diagnostics/tests；存在既有“先开轮次再判停”的流程惯性；无多人协作、无外部发布。
- 风险等级：标准
- 不可逆性：混合
- 强制模块：M-01
- 已选模块：M-01, M-02, M-03, M-07, M-08
- 未选模块：M-04（职责边界已明确，不引入新的角色能力）；M-05（本轮不做供应商迁移或外部环境路线）；M-06（无多人/多代理交接）；M-09（本地可逆改动，无生产或外部承诺）。
- 用户覆盖：无 `--modules/--exclude`；用户已批准本版本全部六个步骤、仅本地日志和不加入联网搜索的边界。
- 模块应用：
  - M-01 -> D-01, ALT-01, G-01, NG-01
  - M-02 -> O-01, L-01
  - M-03 -> W-01, W-02, A-04
  - M-07 -> H-01, H-02
  - M-08 -> ALT-01, ALT-02

## 关键挑战诊断

- D-01 | 本地自动判停在有效语音确认之前就开启并持续上送上游轮次，waiting 状态没有上游边界；在约 55.7 秒后，供应商错误中断会话，而当前日志又丢失嵌套错误字段，造成“模型超时/联网搜索卡住”的误判。
- 支持链 | `75057b2f` 第 8 轮只有 `round_started` 和随后 `UPSTREAM_EVENT`，中间无 commit/ASR/response；前 7 轮和故障后新会话均成功；代码确认 `waiting` 无硬时限、`safeEventSummary` 丢失 `error.*`。
- 关键性 | 上游输入轮次是链式弱环；继续优化 TTS 或浏览器播放无法修复尚未提交的输入，也无法恢复被关闭的 socket。
- ALT-01 | 供应商瞬时错误、配额或网络异常导致第 8 轮失败。证伪：相同会话早期多轮与新会话连续成功，且增强日志复现时未出现对应状态/关闭信息；若出现明确供应商 code，则回到 provider/重试策略层。
- ALT-02 | 本地生命周期/静音流超时导致失败。证伪：长静音实验在未开启上游轮次后不再产生 provider error，讲话仍可完成；若仍失败，则检查 socket/音频格式/供应商服务层。
- 选择 | 先以 ALT-02 为主线修复无界 waiting，同时用增强日志和受控实验保留对 ALT-01 的证伪能力；不把“第 8 轮”当成产品限制，也不引入联网搜索。

## 指导方针

- G-01 | 先把每个阶段的开始、结束、超时和供应商原始错误结构安全落盘，再改变轮次时序；所有故障必须能回答“在哪个阶段、持续多久、最后一个成功里程碑是什么”。
- G-02 | 有效语音确认前只做本地监听和有限预录；确认后才创建上游轮次并发送预录与实时音频；所有阶段都必须有明确期限和失败归属。
- G-03 | 日志只记录结构化元数据、时间线、计数、错误字段和排查 ID，不记录内容；日志写入失败只降级，不反噬语音链路。
- NG-01 | 不加入联网搜索、Function Calling 或 RAG，不把本次超时归因于模型工具调用。
- NG-02 | 不保存音频、转录、模型回复、Base64、密钥或完整供应商 payload；不以扩大日志内容替代阶段设计。

## 近端目标与杠杆点

- O-01 | 在一次真实浏览器会话中，长时间静音不启动上游轮次、不产生 fatal provider timeout；随后讲话能在判停后完成，并在 JSONL 中形成完整阶段时间线。
- 可行性 | 已有 `TurnDetector`、BrowserSession 状态机和 JSONL logger；需补齐事件字段、启动时序、定时器和测试，不需联网搜索或新服务。
- L-01 | “语音确认前不上游”是最大杠杆：一次改变同时消除无界 waiting、减少无意义音频上传，并让 provider round 的起点与用户真实语音对齐。
- L-02 | 嵌套 provider error + 单调时间线是诊断杠杆：一次失败即可区分 waiting、commit、ASR、生成、播放和 socket 层。
- 杠杆失效信号 | 静音期间仍出现 `round_started`/provider append；失败日志仍只有通用 message；或增强后实验仍在明确阶段之外失败。出现时回到 D-01/ALT-01，不扩展到搜索功能。
- 暂不追求 | 远程监控、自动修复、多用户审计、供应商迁移、联网搜索和完整内容级可观测性。

## 连贯行动

| ID | 行动 | addresses | implements | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-01 | 固化故障基线与可复现实验规格 | D-01, ALT-01 | G-01, O-01 | 历史 JSONL、状态机代码、正常/失败轮次 | 基线时间线、场景矩阵和可证伪判据 | none | 只读工作区和本地日志 | 明确第 8 轮时间差、无 commit 证据、客户端 timeout 边界、至少两条竞争解释 | 若证据不足以支持主线，停止改动并转为 ALT-01/ALT-02 对照探索 |
| A-02 | 扩展诊断 schema 与阶段事件 | D-01, W-01 | G-01, G-03, O-01 | 现有 diagnostics schema、阶段和安全字段 | 版本化阶段事件、耗时、计数、timer、provider error 字段白名单 | A-01 | 工作区写入；不读取或保存内容/密钥 | 每条事件可关联 diagnostic/session/round；嵌套错误 type/code/param 可保存；禁止字段测试通过 | 若字段会泄露内容或无法区分阶段，回退 schema 设计，不增加原始 payload |
| A-03 | 增强 provider 事件解析与传输诊断 | D-01, ALT-01 | G-01, G-03, O-01 | `ServerEvent`、握手/关闭事件、provider event_id/logid | 安全 provider summary、发送/接收里程碑、close/timeout 元数据 | A-02 | 工作区写入；不记录鉴权头或完整 body | 上游 `error.type/code/message/param`、event_id、status、close code/reason 可在日志中还原；audio delta 只累计字节 | 若 provider 返回非 JSON/字段异常，记录解析错误和原始长度/类型后停止，不保存正文 |
| A-04 | 修复语音确认前的上游轮次时序并增加阶段期限 | D-01, W-02 | G-02, O-01 | TurnDetector、浏览器 capture、网关状态机、预录缓冲 | 语音确认后才 `ptt.start`，有限预录 flush，listening/thinking/response/playback 期限 | A-01,A-02,A-03 | 工作区写入；localhost 麦克风验证 | 连续静音 70–90 秒不上游、不报 provider timeout；有效语音句首不丢失；提交/响应阶段超时有明确 code 和关闭/恢复路径 | 若语音句首截断或状态转换回归，暂停后回到 capture/pre-roll 接口，不放宽为无限等待 |
| A-05 | 接入网关阶段时间线与可恢复错误路径 | D-01, W-01, W-02 | G-01, G-02, O-01 | A-02/A-03/A-04、BrowserSession | state transition、speech/commit/ASR/audio/response/playback 里程碑、round abort/close 记录 | A-02,A-03,A-04 | 工作区写入；不改变外部服务 | 成功/失败轮次均有边界事件、最后里程碑和阶段耗时；供应商错误不会被覆盖成通用错误 | 若 provider socket 已关闭，停止发送并明确进入 error/重建路径；不在失效 socket 上重试音频 |
| A-06 | 接入浏览器诊断与本地 ID 关联 | D-01, W-02 | G-01, G-03, O-01 | 浏览器检测状态、socket、播放计时和 gateway diagnostic_id | 浏览器事件、RMS/帧计数摘要、诊断 ID、断线兜底 | A-02,A-05 | 工作区写入；短元数据上报 | 能区分麦克风初始化、未检测到语音、socket、播放中断；不发送音频/转录 | 若浏览器已断线，上报失败不阻塞关闭，依靠 gateway close/error 记录兜底 |
| A-07 | 增强诊断查看命令的时间线与根因提示 | D-01, L-02 | G-01, G-03, O-01 | JSONL、diagnostic/session/round 筛选参数 | 阶段排序、耗时、缺失里程碑、候选故障层和导出摘要 | A-02,A-05,A-06 | 工作区写入；只读本地日志 | `npm run diagnostics -- --id=...` 能指出 listening 超时、provider error 嵌套码、最后里程碑和坏行；不输出敏感内容 | 若日志损坏，跳过坏行并标记不完整时间线，不修改原文件 |
| A-08 | 更新文档与故障复现手册 | D-01, O-01 | G-01, O-01, NG-01 | 实际实现、事件表、实验矩阵 | README/architecture/diagnostics 文档和复现步骤 | A-04,A-05,A-07 | 工作区写入；不外发 | 文档明确“第 8 轮非固定限制”、日志位置、阶段码、静音/长语音验证和不做联网搜索 | 若文档与实现字段不一致，停止交付并以实际 schema/时间线为准修订 |
| A-09 | 增加单元、集成和故障注入测试 | D-01, W-01, W-02 | G-01, G-02, O-01 | diagnostics/provider/audio/browser 代码、模拟事件和临时目录 | 测试覆盖嵌套 error、阶段 deadline、预录、静音、socket/写入失败 | A-02,A-03,A-04,A-05,A-06 | 工作区写入；本地测试 | 覆盖正常轮次、长静音、未 commit 超时、嵌套 provider error、浏览器断线、播放中断、logger 降级；隐私扫描通过 | 任一测试失败则保持 IN_PROGRESS，回到对应 schema/状态机层，禁止用放宽超时掩盖失败 |
| A-10 | 执行全量检查与真实浏览器验收 | D-01, ALT-01, W-02 | G-01, G-02, O-01 | A-07/A-08/A-09、localhost 服务、已授权浏览器/麦克风 | check/test/build、长静音证据、连续多轮证据和一次可控错误日志 | A-07,A-08,A-09 | 本地命令、localhost 和已授权浏览器；不上传、不部署 | `npm run check`、`npm test`、`npm run build` 通过；静音不 fatal、讲话可恢复、日志可诊断；若真实上游仍错误，日志包含确切 code/阶段 | 若真实验证失败，保留日志和诊断 ID，标记失败层并回到 A-03/A-04/A-05，不宣称完成 |

## 链式弱环节与风险

- W-01（事件 schema → logger）：字段不足会使阶段无法区分；闸门是嵌套错误、阶段耗时和禁止字段测试必须通过，否则回到 A-02。
- W-02（本地 detector → gateway/provider round）：若启动时序错位，静音仍会占用上游；闸门是 70–90 秒静音期间无 `round_started`/append，讲话后预录与实时音频顺序正确，否则回到 A-04。
- W-03（provider socket → recoverable close）：上游 error/close 后继续发送会制造二次错误；闸门是停止发送、记录 close、进入明确恢复/错误状态，否则回到 A-03/A-05。
- R-01（隐私）：出现音频、转录、Base64、密钥或完整 payload 即阻断交付并回到 A-02/A-09。
- R-02（供应商阈值未知）：不得把 55.7 秒当作官方固定 SLA；若确切 code 与主诊断不符，回到 ALT-01/provider 层。
- 串行关系：A-01→A-02→A-03→A-04→A-05；A-06 依赖 A-02/A-05；A-07/A-08 依赖可观察实现；A-09 在实现稳定后执行；A-10 等待 A-07/A-08/A-09。

## 假设与失败信号

- H-01 | 主张：语音确认前不上游能消除本次无界 waiting。预期：70–90 秒静音不会产生 `round_started`、provider append 或 upstream timeout，随后讲话仍完成；最小验证：A-09/A-10；通过标准：静音窗口无 fatal provider 事件且下一句产生完整 round；失败信号：静音仍触发 provider 错误，或预录导致句首缺失；失败后重查 A-04 的 capture/pre-roll 与 provider 事件边界。
- H-02 | 主张：嵌套错误字段和阶段时间线足以区分供应商瞬时故障与本地生命周期故障。预期：模拟 error、socket close、deadline 和浏览器断线各落在不同 code/阶段；最小验证：A-03/A-09；通过标准：每种故障按 diagnostic/session/round 可定位；失败信号：仍只出现通用 message 或缺失最后里程碑；失败后重查 A-02/A-03 schema/交接。

## 决策与批准

- 当前状态：APPROVED；用户已明确批准 v1 全部六个可见步骤。
- 获批自主范围：修改 diagnostics/provider/gateway/audio/browser/tests/docs；运行本地检查、故障注入和已授权 localhost 浏览器验证；不加入联网搜索、不读取或保存内容、不上传、不部署、不提交 Git。
- Q-01 | 长静音策略：本地继续监听，上游仅在有效语音后启动；已由用户批准默认方案。
- Q-02 | 日志策略：阶段化 JSONL、嵌套错误安全字段、7 天本地保留、禁止内容白名单；已由用户批准默认方案。
- 缺失权限/资料：无；供应商历史错误码不可恢复，需靠新日志复现。
- 完成标准：A-01 至 A-10 均有证据；长静音不触发 fatal provider timeout；有效语音可完成；异常可定位到阶段/错误码；检查、测试、构建、隐私扫描通过。

| step_id | visible_step | action_ids | approval_notes |
| --- | --- | --- | --- |
| S-01 | 固化故障基线与复现实验 → 明确第 8 轮时间线、竞争解释和验证判据。 | A-01 | 只读历史日志和代码，不修改外部系统。 |
| S-02 | 升级诊断 schema 与供应商事件解析 → 保存嵌套错误、阶段计时和安全传输元数据。 | A-02,A-03 | 只写本地结构化元数据；禁止音频、文本、Base64、密钥和完整 payload。 |
| S-03 | 修复语音确认前的上游时序并接入阶段恢复 → 长静音不上游，异常有明确期限和错误路径。 | A-04,A-05 | 修改 audio/browser/gateway/provider 交互；保留句首预录与回退边界。 |
| S-04 | 接入浏览器诊断、时间线查看和文档 → 可按诊断 ID 找到最后里程碑和候选故障层。 | A-06,A-07,A-08 | 只读/写本地日志和文档，不外发。 |
| S-05 | 增加单元、集成和故障注入测试 → 证明日志完整、隐私安全、主链路不被日志反噬。 | A-09 | 测试失败阻断真实验收，不放宽标准掩盖问题。 |
| S-06 | 执行全量检查与真实浏览器验收 → 长静音、有效语音、连续轮次和可控错误均有证据。 | A-10 | 使用已授权 localhost/麦克风；失败时保留诊断证据并回到具体弱环。 |
