---
task_schema: plan-tasks-tracker/v2
plan_schema: rumelt-task-plan/v2
plan_id: PT-ai-respawn-diagnostics
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06,A-07,A-08,A-09,A-10
approved_plan_digest: sha256:f4869c08337fae50b886cae639663c21e83f98ab40e42ded547d770e3b7e776b
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-04,M-05,M-06,M-07,M-08
execution_status: COMPLETED
created_at: 2026-08-30
updated_at: 2026-08-30
---

# 任务追踪：最小日志与诊断系统

## 任务目标与批准快照

- 目标：为本地 AI Respawn PTT Demo 增加可留存、可关联、可复盘的最小诊断日志系统，不保存输入音频、输出音频、转写文本、模型回复、Base64 或密钥。
- 主要诊断：现有信息分散在临时 stdout、浏览器内存和少量错误转发中，缺少持久化与跨层关联 ID，无法稳定定位故障层。
- 指导方针：共享 JSONL logger 作为唯一落盘边界；只记录会话/轮次生命周期、关键耗时/计数、错误上下文和供应商排查 ID；逐音频分片只累计计数。
- 近端目标：任意成功或失败的浏览器轮次都能通过 session_id、round 和简短诊断 ID在本地日志中找到一组可解析、无敏感内容的记录。
- 主动不做：不保存音频/文本/Base64/API Key；不做远程监控、告警平台、完整性能面板、自动修复或多用户审计。
- 批准依据：用户已批准 v1 全部五个可见步骤，并接受项目根目录 `logs/`、按日期 JSONL、保留最近 7 天和显示简短诊断 ID的默认方案。
- 路由快照：标准风险、混合可逆性；依赖跨 provider/gateway/browser/CLI/docs；既有 stdout 惯性；无外部发布或多人协作。
- 已选模块：M-01,M-02,M-03,M-04,M-05,M-06,M-07,M-08。
- 用户步骤映射：S-01 -> A-01,A-02; S-02 -> A-03,A-04; S-03 -> A-05,A-06; S-04 -> A-07,A-08; S-05 -> A-09,A-10

## 变更范围

- 涉及模块或目录：`packages/diagnostics/`、`packages/provider-doubao/`、`apps/server/`、`apps/web/`、`scripts/`、`packages/*/*.test.ts`、`docs/`、`.gitignore`、`package.json`。
- 预计影响文件数：约 12-18 个（新增 logger/schema/命令/测试，修改现有 provider、网关、浏览器、CLI、文档和忽略规则）。
- 允许的工具与权限：工作区文件编辑；本地 `logs/` 写入；Node.js 类型检查、离线测试、构建和 localhost 验证；不需要新真实模型调用。
- 禁止或需另行批准：读取/打印密钥；保存音频、文本或 Base64；远程上传日志；公开部署；提交 Git 或扩大到远程监控/告警/多用户审计。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 用户确认的五类事件、现有 provider/gateway/browser 信号 | `packages/diagnostics/src/schema.ts` 类型、事件字段白名单、禁止字段规则 | none | 工作区写入；不读取密钥或内容 | schema 覆盖会话/轮次/成功/错误/关闭；禁止音频、文本、Base64、密钥字段；可被单元测试调用 | 若字段无法区分责任层，暂停实现并回到 D-01，只增加结构化元数据，不引入原始内容 |
| A-02 | A-01 schema、`logs/` 路径、7 天默认保留 | 可复用 logger、日期文件、7 天清理、写入失败降级策略 | A-01 | 工作区写入和本地 `logs/`；修改 `.gitignore` | 每条记录一行合法 JSON；目录自动创建；清理/写入失败不抛入主链路；日志目录不进 Git | 若文件锁或权限导致写入失败，保留 stderr 记录并继续会话；不阻塞音频或关闭 |
| A-03 | A-01/A-02、浏览器连接和 provider 会话 | session_id、round 字段及统一事件写入入口 | A-02 | 工作区写入；本地服务重启 | 一个会话的开始、轮次、错误和关闭记录可由 session_id/round 关联；ID 不包含密钥或用户内容 | 若某层无法传递 ID，先在交接接口补齐字段，暂停新增日志类型 |
| A-04 | provider client 现有握手、event_id、错误和 socket 状态 | 脱敏的 HTTP 状态、X-Tt-Logid（可得时）、provider event_id、close code/reason | A-01,A-02 | 工作区写入；不记录鉴权头或完整响应体 | 4xx/5xx、超时、异常关闭可定位；API Key 和完整 body 永不落盘 | 若 Logid 不可得，记录 `unavailable` 和已有 event_id/status；不扩大响应采集范围 |
| A-05 | A-02/A-03/A-04、现有 BrowserSession 状态机 | session_started、round_started、round_completed、error、session_closed 记录 | A-03,A-04 | 工作区写入；localhost 运行 | 成功轮次和失败轮次各有边界事件；记录关键耗时/计数/错误上下文；不逐分片写日志 | 若日志回调异常，捕获并降级 stderr；不改变既有状态转换和关闭清理 |
| A-06 | A-02/A-03、浏览器错误/关闭、probe/PTT 摘要 | 浏览器客户端错误上报、probe/PTT 使用同一 schema、诊断 ID展示 | A-02,A-03,A-05 | 工作区写入；浏览器仅发送短错误码/消息 | 浏览器刷新前后可报告错误 ID；probe/PTT 不再产生逐 delta 日志；输入/输出内容不落盘 | 若浏览器已断线无法上报，网关 close 记录作为兜底；不重试或缓存原始内容 |
| A-07 | A-02 日志目录与脱敏 schema | `npm run diagnostics` 查看最近记录/路径并导出脱敏摘要 | A-02,A-06 | 工作区写入；只读本地日志 | 命令不打印敏感字段；无日志时给出明确提示；可按 session/diagnostic ID筛选 | 若日志文件损坏，跳过坏行并报告行号；不修改原日志、不阻塞服务 |
| A-08 | A-01~A-07 的最终行为 | README、架构/契约文档、日志字段和排查步骤 | A-05,A-06,A-07 | 工作区写入；不提交密钥或日志 | 新机器可知道日志位置、字段含义、诊断 ID反馈方式和禁止内容；`logs/` 不进入 Git | 若文档与实现不一致，暂停交付并以实际 schema 为准修订，不保留过时字段 |
| A-09 | A-01~A-06、临时目录和故障注入 | 单元/集成测试覆盖 schema、写入、清理、降级、断线和禁止字段 | A-05,A-06 | 工作区写入；本地测试 | 测试证明成功/失败可关联，写入失败不阻塞，日志无音频/文本/Base64/Key；覆盖至少 4 类故障 | 任一隐私或主链路测试失败，阻断 A-10，回到对应 logger/交接层修复 |
| A-10 | A-08/A-09、localhost Demo | 类型检查、测试、构建、一次成功轮次和一次可控错误的日志证据 | A-08,A-09 | 本地命令和 localhost 验证；不需要真实模型新调用 | `npm run check`、`npm test`、`npm run build:web` 通过；日志可读、可关联、无禁止字段；主链路行为不变 | 若任一门失败，保持 IN_PROGRESS，记录失败层并回到 A-05/A-06/A-09，不宣称完成 |

## 任务明细

- [x] T-01 | A-01 | 固化最小诊断事件 schema 与脱敏规则 | output: `packages/diagnostics/src/schema.ts` 及禁止字段测试输入 | acceptance: 五类事件字段可解析，音频/文本/Base64/API Key 字段被拒绝或不存在
- [x] T-02 | A-02 | 实现本地 JSONL logger、日期滚动和 7 天清理 | output: 可复用 logger 与 `logs/` 写入/清理实现 | acceptance: 每行是合法 JSON，写入/清理失败可降级且不抛入主链路，`logs/` 被 Git 忽略
- [x] T-03 | A-03 | 为网关会话和轮次建立关联 ID | output: BrowserSession 的 session_id、round 和统一事件入口 | acceptance: 同一会话的开始、轮次、错误、关闭记录可由 ID 关联
- [x] T-04 | A-04 | 暴露供应商握手与关闭的安全排查信息 | output: HTTP 状态、可得的 X-Tt-Logid、event_id、close code/reason 的脱敏记录 | acceptance: 4xx/5xx、超时、异常关闭可定位且不落盘鉴权头/完整 body
- [x] T-05 | A-05 | 接入网关生命周期、轮次和错误日志 | output: 五类网关事件的 JSONL 记录 | acceptance: 成功/失败轮次均有边界事件、关键耗时/计数和错误上下文，未产生逐分片日志
- [x] T-06 | A-06 | 接入浏览器、probe 与 CLI 的最小诊断信号 | output: 短错误上报、统一 schema 和诊断 ID展示 | acceptance: 浏览器错误可关联；probe/PTT 不再逐 delta 输出；输入/输出内容不落盘
- [x] T-07 | A-07 | 增加诊断查看与导出命令 | output: `npm run diagnostics` 命令和筛选/脱敏摘要 | acceptance: 能列出日志路径、查看最近记录、按 ID筛选；无日志/坏行有明确提示且原文件不被修改
- [x] T-08 | A-08 | 更新忽略规则、文档和复现手册 | output: README、架构/契约文档和 `.gitignore` 更新 | acceptance: 文档说明日志位置、字段、诊断 ID反馈、禁止内容和排查步骤；`logs/` 不在 Git 状态中
- [x] T-09 | A-09 | 增加 logger、脱敏和故障路径测试 | output: 单元/集成/故障注入测试 | acceptance: 覆盖成功、超时、上游错误、浏览器断线、播放中断和写入失败；敏感字段扫描通过
- [x] T-10 | A-10 | 运行全量检查并完成本地诊断验收 | output: check/test/build 结果、成功轮次和可控错误的日志证据 | acceptance: 三项命令通过；日志可读、可关联、无禁止字段；语音主链路行为未回归

## 发现与变更记录

- 2026-08-30 | 用户批准 `PT-ai-respawn-diagnostics` v1 全部步骤；执行状态设为 IN_PROGRESS。
- 2026-08-30 | 计划验证器要求 Python 运行时，但当前 Windows 环境未安装 `python`/`py`；计划 digest 使用相同 BOM/LF 规范化规则由 Node 计算，待可用 Python 后补跑官方验证器。
- 2026-08-30 | T-01/T-02 已通过：schema 白名单、消息脱敏、JSONL 写入和 logger 降级测试通过；`npm test` 当前 28/28 通过。
- 2026-08-30 | T-03/T-08 已通过：网关/浏览器/probe/PTT 已接入关联诊断；`npm run diagnostics` 支持查看、筛选和导出；文档与 `logs/` 忽略规则已更新。
- 2026-08-30 | T-09 已通过：logger、schema、脱敏、保留、写入失败、上游/浏览器/播放阶段错误记录测试通过；`npm test` 28/28。
- 2026-08-30 | T-10 已通过：`npm run check`、`npm test`、`npm run build`、`npm run diagnostics`、`/health` 和受控浏览器诊断会话均通过；日志无禁止字段且可按诊断 ID导出。
- 2026-08-30 | 计划与追踪验证器已使用工作区 bundled Python 重跑并报告 VALID；计划 digest 与 tracker 一致。
- 2026-08-30 | 按 C-05 未执行新的真实模型轮次；成功轮次结构由 `round_completed` 单元测试覆盖，真实语音链路代码仅做日志接入并通过类型检查/构建。

## 完成标准

- 所有 T-01 至 T-10 均通过并有证据；每个 A-* 均有完成记录。
- 成功和失败轮次均可用 session_id、round 和诊断 ID关联到 JSONL 记录。
- 日志不包含输入/输出音频、转写文本、模型文本、Base64、API Key 或完整请求/响应。
- 日志写入、滚动或清理失败不会破坏会话、播放或关闭清理。
- `npm run check`、`npm test`、`npm run build:web` 通过，README 与实际实现一致。
- A-01 | evidence: `packages/diagnostics/src/schema.ts` 与 schema/脱敏测试定义五类事件和字段白名单。
- A-02 | evidence: `packages/diagnostics/src/logger.ts` 写入按日期 JSONL、执行 7 天清理并在失败时降级；logger 测试通过。
- A-03 | evidence: 网关 BrowserSession 生成并贯穿 `session_id`、`round` 和短诊断 ID；受控会话日志已按 ID关联。
- A-04 | evidence: provider client 发出握手拒绝、socket 错误/关闭的脱敏诊断信息；完整响应体和鉴权头未采集。
- A-05 | evidence: 网关写入 session/round/error/close 生命周期记录；受控浏览器诊断会话生成三条可读记录。
- A-06 | evidence: 浏览器错误上报、页面诊断 ID、probe/PTT 统一 logger 接入完成，未新增逐 delta 日志。
- A-07 | evidence: `npm run diagnostics -- --id=780a1b19 --export=artifacts/diagnostics-export.jsonl` 成功筛选并导出。
- A-08 | evidence: README、architecture、provider contract、`.gitignore` 已同步日志路径、字段、保留和排查步骤。
- A-09 | evidence: logger/协议/脱敏/保留/写入失败/上游/浏览器/播放阶段测试共 28/28 通过。
- A-10 | evidence: `npm run check`、`npm test`、`npm run build`、`npm run diagnostics`、网关 `/health` 和禁止字段扫描均通过。
