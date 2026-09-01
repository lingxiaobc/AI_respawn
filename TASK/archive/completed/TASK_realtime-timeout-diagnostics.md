---
task_schema: plan-tasks-tracker/v2
plan_schema: rumelt-task-plan/v2
plan_id: PT-realtime-timeout-diagnostics
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05,S-06
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06,A-07,A-08,A-09,A-10
approved_plan_digest: sha256:c11845d0d1fc80ef932fc86a73811a8e4bc7778ea349e6b8942543a17c9d8feb
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-07,M-08
execution_status: COMPLETED
created_at: 2026-08-30
updated_at: 2026-08-30
---

# 任务追踪：第 8 轮超时诊断与日志系统升级

## 任务目标与批准快照

- 目标：排查第 8 轮 listening 超时，修复有效语音确认前的无界上游等待，并升级本地阶段化诊断日志。
- 主要诊断：自动判停在有效语音确认前就开启并持续上送上游轮次，约 55.7 秒后供应商中断；现有日志又丢失嵌套错误字段。
- 指导方针：先记录阶段开始/结束/超时和供应商错误结构，再改变轮次时序；本地监听与上游轮次解耦；不保存内容。
- 近端目标：长静音不启动上游且不 fatal，随后讲话可完成，并能按 diagnostic/session/round 复盘。
- 主动不做：不加入联网搜索、Function Calling/RAG、远程监控、内容级日志、自动修复、多用户审计或供应商迁移。
- 批准依据：用户已明确批准 `PT-realtime-timeout-diagnostics` v1 全部六个可见步骤。
- 路由快照：标准风险、混合可逆性；关键依赖为 detector → browser → gateway → provider → diagnostics；历史错误码不可恢复，需新日志复现。
- 已选模块：M-01,M-02,M-03,M-07,M-08。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02,A-03; S-03 -> A-04,A-05; S-04 -> A-06,A-07,A-08; S-05 -> A-09; S-06 -> A-10

## 变更范围

- 涉及模块或目录：`packages/diagnostics/`、`packages/provider-doubao/`、`packages/audio/`、`apps/server/`、`apps/web/`、`scripts/`、测试和 `docs/`。
- 预计影响文件数：约 12–20 个，包含 schema/logger、provider/gateway/browser/audio、CLI、测试和文档。
- 允许的工具与权限：工作区编辑；本地 JSONL 日志；Node.js 类型检查、测试、构建；已授权 localhost 浏览器/麦克风验证。
- 禁止或需另行批准：读取/打印密钥；保存音频、转录、模型回复、Base64 或完整 payload；远程上传、部署、提交 Git；加入联网搜索。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 历史 JSONL、状态机代码、正常/失败轮次 | 基线时间线、场景矩阵和可证伪判据 | none | 只读工作区和本地日志 | 明确第 8 轮时间差、无 commit 证据、客户端 timeout 边界、至少两条竞争解释 | 若证据不足以支持主线，停止改动并转为 ALT-01/ALT-02 对照探索 |
| A-02 | 现有 diagnostics schema、阶段和安全字段 | 版本化阶段事件、耗时、计数、timer、provider error 字段白名单 | A-01 | 工作区写入；不读取或保存内容/密钥 | 每条事件可关联 diagnostic/session/round；嵌套错误 type/code/param 可保存；禁止字段测试通过 | 若字段会泄露内容或无法区分阶段，回退 schema 设计，不增加原始 payload |
| A-03 | `ServerEvent`、握手/关闭事件、provider event_id/logid | 安全 provider summary、发送/接收里程碑、close/timeout 元数据 | A-02 | 工作区写入；不记录鉴权头或完整 body | 上游 `error.type/code/message/param`、event_id、status、close code/reason 可在日志中还原；audio delta 只累计字节 | 若 provider 返回非 JSON/字段异常，记录解析错误和原始长度/类型后停止，不保存正文 |
| A-04 | TurnDetector、浏览器 capture、网关状态机、预录缓冲 | 语音确认后才 `ptt.start`，有限预录 flush，listening/thinking/response/playback 期限 | A-01,A-02,A-03 | 工作区写入；localhost 麦克风验证 | 连续静音 70–90 秒不上游、不报 provider timeout；有效语音句首不丢失；提交/响应阶段超时有明确 code 和关闭/恢复路径 | 若语音句首截断或状态转换回归，暂停后回到 capture/pre-roll 接口，不放宽为无限等待 |
| A-05 | A-02/A-03/A-04、BrowserSession | state transition、speech/commit/ASR/audio/response/playback 里程碑、round abort/close 记录 | A-02,A-03,A-04 | 工作区写入；不改变外部服务 | 成功/失败轮次均有边界事件、最后里程碑和阶段耗时；供应商错误不会被覆盖成通用错误 | 若 provider socket 已关闭，停止发送并明确进入 error/重建路径；不在失效 socket 上重试音频 |
| A-06 | 浏览器检测状态、socket、播放计时和 gateway diagnostic_id | 浏览器事件、RMS/帧计数摘要、诊断 ID、断线兜底 | A-02,A-05 | 工作区写入；短元数据上报 | 能区分麦克风初始化、未检测到语音、socket、播放中断；不发送音频/转录 | 若浏览器已断线，上报失败不阻塞关闭，依靠 gateway close/error 记录兜底 |
| A-07 | JSONL、diagnostic/session/round 筛选参数 | 阶段排序、耗时、缺失里程碑、候选故障层和导出摘要 | A-02,A-05,A-06 | 工作区写入；只读本地日志 | `npm run diagnostics -- --id=...` 能指出 listening 超时、provider error 嵌套码、最后里程碑和坏行；不输出敏感内容 | 若日志损坏，跳过坏行并标记不完整时间线，不修改原文件 |
| A-08 | 实际实现、事件表、实验矩阵 | README/architecture/diagnostics 文档和复现步骤 | A-04,A-05,A-07 | 工作区写入；不外发 | 文档明确“第 8 轮非固定限制”、日志位置、阶段码、静音/长语音验证和不做联网搜索 | 若文档与实现字段不一致，停止交付并以实际 schema/时间线为准修订 |
| A-09 | diagnostics/provider/audio/browser 代码、模拟事件和临时目录 | 测试覆盖嵌套 error、阶段 deadline、预录、静音、socket/写入失败 | A-02,A-03,A-04,A-05,A-06 | 工作区写入；本地测试 | 覆盖正常轮次、长静音、未 commit 超时、嵌套 provider error、浏览器断线、播放中断、logger 降级；隐私扫描通过 | 任一测试失败则保持 IN_PROGRESS，回到对应 schema/状态机层，禁止用放宽超时掩盖失败 |
| A-10 | A-07/A-08/A-09、localhost 服务、已授权浏览器/麦克风 | check/test/build、长静音证据、连续多轮证据和一次可控错误日志 | A-07,A-08,A-09 | 本地命令、localhost 和已授权浏览器；不上传、不部署 | `npm run check`、`npm test`、`npm run build` 通过；静音不 fatal、讲话可恢复、日志可诊断；若真实上游仍错误，日志包含确切 code/阶段 | 若真实验证失败，保留日志和诊断 ID，标记失败层并回到 A-03/A-04/A-05，不宣称完成 |

## 任务明细

- [x] T-01 | A-01 | 固化第 8 轮基线时间线和对照场景 | output: 历史证据摘要与正常/失败/静音/长语音矩阵 | acceptance: 能指出 55.7 秒 listening 间隔、缺失 commit/ASR/response 和两条竞争诊断
- [x] T-02 | A-02 | 扩展诊断 schema 的阶段、计时、错误和计数白名单 | output: 可通过 schema 构造的阶段化诊断记录 | acceptance: 嵌套 error 字段可安全保存，禁止内容字段测试通过
- [x] T-03 | A-03 | 完善 provider 事件摘要、发送/接收里程碑和 socket 诊断 | output: provider summary 与 close/timeout 元数据 | acceptance: error.type/code/message/param、event_id、status、close 信息可关联且无正文泄露
- [x] T-04 | A-04 | 解耦本地监听与上游轮次并加入预录和阶段 deadline | output: 语音确认后启动上游、预录 flush、期限保护 | acceptance: 长静音不上游，讲话句首不丢失，阶段超时有明确错误码
- [x] T-05 | A-05 | 接入网关阶段时间线和 socket 关闭恢复路径 | output: 状态/里程碑/round abort/error/close 日志 | acceptance: 成功和失败轮次都有最后里程碑和耗时，失效 socket 不再收音频
- [x] T-06 | A-06 | 接入浏览器诊断元数据与断线兜底 | output: 浏览器短错误、检测阶段、计数和 diagnostic_id 关联 | acceptance: 能区分麦克风、未检测语音、socket、播放故障且不上传内容
- [x] T-07 | A-07 | 增强诊断命令的时间线、缺失事件和根因提示 | output: 按 ID/session/round 的可读诊断摘要 | acceptance: 指出阶段耗时、最后里程碑、嵌套 code、坏行且不输出敏感字段
- [x] T-08 | A-08 | 更新文档和复现手册 | output: README、架构和诊断命令说明 | acceptance: 明确第 8 轮不是固定限制、长静音验证方法和不做联网搜索
- [x] T-09 | A-09 | 增加单元、集成和故障注入测试 | output: 测试覆盖正常、静音、超时、provider error、断线、播放和 logger 降级 | acceptance: 测试通过且隐私扫描无音频/文本/Base64/密钥
- [x] T-10 | A-10 | 执行全量检查和真实浏览器验收 | output: check/test/build 与真实长静音/连续轮次/可控错误证据 | acceptance: 静音不 fatal、讲话可完成、异常可定位、所有命令通过

## 发现与变更记录

- 2026-08-30 | 用户批准 `PT-realtime-timeout-diagnostics` v1 全部六个步骤；执行状态设为 IN_PROGRESS。
- 2026-08-30 | 计划校验通过；digest 为 `sha256:c11845d0d1fc80ef932fc86a73811a8e4bc7778ea349e6b8942543a17c9d8feb`。
- 2026-08-30 | T-01/A-01 已通过：第 8 轮从 10:23:13.365Z 到 10:24:09.063Z 在 listening 持续 55.698 秒，无 commit/ASR/response；前 7 轮及新会话成功，主线锁定为无界上游 waiting，保留 provider 瞬时错误为竞争解释。
- 2026-08-30 | T-02/A-02 已通过：诊断 schema 升级为 v2，新增阶段、计时、provider error、方向、timer、里程碑和安全计数字段；37 项测试通过且禁止内容字段仍被拦截。
- 2026-08-30 | T-03/A-03 已通过：provider summary 现在读取嵌套 `error.type/code/message/param`，控制事件记录 outbound 元数据，音频 delta 仅保留计数；嵌套错误测试通过。
- 2026-08-30 | T-04/A-04 已通过：浏览器 `ready` 阶段本地监听 72.678 秒未创建 provider round；检测到本地语音后 flush 25 帧（500 ms）并连续完成多轮；网关为 listening/thinking/speaking 设置 35/20/120 秒期限。
- 2026-08-30 | T-05/A-05 已通过：真实浏览器诊断 `61d364ca` 的成功轮次包含 speech/commit/ASR/audio/response/ready 完整里程碑；受控诊断 `7298fe5d` 包含 `round_aborted`、`error`、error→closing→closed 和 `session_closed`，关闭后停止上游音频。
- 2026-08-30 | T-06/A-06 已通过：浏览器显示并上报 diagnostic ID，`LOCAL_SPEECH_START`、`LOCAL_TURN_END` 与 pre-roll/计数可关联；日志扫描确认不含音频、转写或完整 payload。
- 2026-08-30 | T-07/A-07 已通过：`npm run diagnostics -- --id=7298fe5d --tail=300` 输出按 session/round 时间线、`phase_timeout`、`UPSTREAM_PHASE_TIMEOUT`、最后状态和坏行计数；旧 v1 记录仍可读取。
- 2026-08-30 | T-08/A-08 已通过：README、architecture 和 provider contract 已同步本地监听、阶段期限、诊断字段、复现命令及“不做联网搜索”边界。
- 2026-08-30 | T-09/A-09 已通过：38 项离线测试全部通过，覆盖长静音、判停/预录、嵌套 provider error、浏览器断线/播放队列、logger 降级与隐私白名单；`7298fe5d` 提供未 commit 阶段超时故障注入证据。
- 2026-08-30 | T-10/A-10 已通过：`npm.cmd run check`、`npm.cmd test`（38/38）和 `npm.cmd run build` 全部通过；浏览器诊断 `61d364ca` 在 ready 阶段 72.678 秒未启动上游，随后多轮成功；受控 `7298fe5d` 明确定位 listening 35.008 秒期限并优雅关闭；隐私扫描 clean。

## 完成标准

- 所有 T-01 至 T-10 均通过，每个 A-* 都有完成证据。
- 长静音 70–90 秒不启动上游轮次、不产生 fatal provider timeout；随后有效语音可完成。
- 任意 provider error 均可按 diagnostic/session/round 定位到阶段、嵌套错误码和最后里程碑。
- 日志不包含音频、转录、模型回复、Base64、API Key 或完整请求/响应；日志失败不破坏会话。
- `npm run check`、`npm test`、`npm run build` 和真实 localhost 浏览器验收通过，文档与实现一致。

完成证据：

- 2026-08-30 | 所有 T-01 至 T-10 已通过；计划 digest 保持 `sha256:c11845d0d1fc80ef932fc86a73811a8e4bc7778ea349e6b8942543a17c9d8feb`。
- 2026-08-30 | 真实浏览器会话 `61d364ca`：ready 本地监听 72.678 秒无 provider round；检测本地语音后预录 25 帧并完成连续轮次，无 error。
- 2026-08-30 | 受控未提交会话 `7298fe5d`：`listening` 35.008 秒后 `round_aborted/error(UPSTREAM_PHASE_TIMEOUT)`，随后 `error→closing→closed`，CLI 诊断为 `phase_timeout`。
- 2026-08-30 | 38/38 测试、TypeScript check、生产构建和隐私扫描均通过。
- A-01 | evidence: `TASK/PLAN_realtime-timeout-diagnostics.md` 固化第 8 轮 55.698 秒基线、无 commit 证据和竞争解释；实现按 session/round 建立可证伪时间线。
- A-02 | evidence: `packages/diagnostics/src/schema.ts` schema v2 白名单包含阶段耗时、deadline、计数和嵌套 provider error；schema/隐私测试通过。
- A-03 | evidence: `packages/provider-doubao/src/protocol.ts` 安全摘要读取嵌套 `error.type/code/message/param`，`client.ts` 记录 outbound 控制事件和 close/timeout 元数据。
- A-04 | evidence: `apps/web/src/App.tsx` 先本地确认语音再 `ptt.start`，最多 flush 25 帧预录；网关 listening/thinking/speaking 期限为 35/20/120 秒。
- A-05 | evidence: `apps/server/src/server.ts` 写入 state transition、milestone、round_aborted、error、session_closed；`61d364ca` 成功时间线和 `7298fe5d` 失败时间线均可复盘。
- A-06 | evidence: 浏览器诊断 ID 和 `LOCAL_SPEECH_START`/`LOCAL_TURN_END` 里程碑已关联到网关；浏览器断线由 close/error 兜底，未发送内容字段。
- A-07 | evidence: `npm run diagnostics -- --id=7298fe5d --tail=300` 输出 timeline、`phase_timeout`、错误码、阶段耗时和坏行计数，且不输出敏感字段。
- A-08 | evidence: `README.md`、`docs/architecture.md`、`docs/provider-contract.md` 已同步本地监听、阶段期限、排查命令和不做联网搜索范围。
- A-09 | evidence: `npm.cmd test` 38/38 通过，覆盖长静音、预录/判停、嵌套 provider error、断线、播放队列、logger 降级；`7298fe5d` 完成未 commit 超时故障注入，隐私扫描 clean。
- A-10 | evidence: `npm.cmd run check`、`npm.cmd test`、`npm.cmd run build` 通过；真实浏览器 `61d364ca` 多轮成功，受控 `7298fe5d` 阶段超时可定位并优雅关闭。
