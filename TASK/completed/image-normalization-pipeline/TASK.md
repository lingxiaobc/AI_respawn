---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: image-normalization-pipeline
plan_id: PT-image-normalization-pipeline
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05,S-06
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06,A-07,A-08
approved_plan_digest: sha256:b58f2db083dbee11f45bc69d6755a9771851a6caa9ffa1d24a791f85f1b88d08
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-04,M-05,M-07,M-08,M-09
execution_status: COMPLETED
created_at: 2026-09-04
updated_at: 2026-09-04
---

# 图片规范化批量流水线执行追踪

## 任务目标与批准快照

- 目标：交付本地管理员上传页、任务列表、可复用 ZenMux 图片规范化服务和串行批处理命令，并产出最多三张人工可审查规范图。
- 主要诊断：随机且付费的图像编辑必须先被约束为可追踪、幂等、密钥不外泄且有身份漂移止损闸门的流水线。
- 指导方针：以服务端唯一的版本化规范合同与适配器作为网页、队列和 CLI 的单一事实来源，并通过哈希、原子写入和无自动重试控制风险。
- 近端目标：在本机完整演示并离线验证流水线，先用一张真实样本验证，再最多扩展到另外两张。
- 主动不做：账号系统、数据库/云队列、自动身份评分、关键点/抠图/动画、自动重试、多候选、部署、提交和推送。
- 批准依据：用户于 2026-09-04 回复“全部批准并执行。创建新分支，在新分支上开发。”
- 路由快照：full；高风险；混合可逆性；auto。
- 已选模块：M-01,M-02,M-03,M-04,M-05,M-07,M-08,M-09
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02,A-03; S-03 -> A-04,A-05; S-04 -> A-06; S-05 -> A-07; S-06 -> A-08

## 变更范围

- 涉及模块或目录：`packages/image-normalization/`、`apps/server/`、`apps/web/`、`scripts/`、`.env.example`、`docs/`、`AI_output/normalized/`、`TASK/`。
- 预计影响文件数：约 15 至 25 个代码、测试、文档和任务追踪文件，外加最多三套生成物。
- 允许的工具与权限：本地 Git 分支创建、仓库文件读写、本地测试/类型检查/构建、本地端口、环境变量读取、最多三次已批准 ZenMux 请求、生成目录写入。
- 禁止或需另行批准：提交、推送、部署、公网发布、额外付费调用、自动重试、完整账号系统、数据库/云队列及嘴眼动画阶段。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 当前工作区、批准的规格与三张样本名 | `codex/image-normalization-pipeline` 分支及版本化规范常量/文档 | none | 创建本地 Git 分支；写入仓库 | 当前分支名称正确，合同明确 1024×1536 PNG、单图单结果、身份保持和禁止项 | 目标分支已存在或工作区异常时停止，保留现状并报告 |
| A-02 | 规范合同、环境变量、输入图片 | 可复用 TypeScript 包及 source.png、canonical.png、metadata.json 输出能力 | A-01 | 读取环境变量；写入仓库与输出目录 | 单元测试验证文件限制、请求参数、Base64 响应、尺寸格式和错误脱敏 | 不自动重试，清理未完成临时文件并保存脱敏失败记录 |
| A-03 | 规范化服务、输入内容哈希 | queued/running/succeeded/failed/skipped 状态和文件型任务记录 | A-02 | 写入输出目录 | 刷新或重启后可读取任务，同内容成功结果再次提交不发起 provider 请求 | 状态置为 failed 并保留脱敏原因；普通队列继续，真实测试闸门停止 |
| A-04 | 顺序队列、现有 Node HTTP 服务 | `/api/normalization/*` 本地 API | A-03 | 监听本地端口；写入仓库 | API 可提交单张或多张、查询状态、读取原图和结果，拒绝路径穿越与超限输入 | 返回结构化 4xx/5xx，不暴露密钥、内部堆栈或任意文件路径 |
| A-05 | 本地 API、现有 React/Vite 应用 | 多选上传、状态列表和原图/规范图并排预览页面 | A-04 | 写入仓库 | 桌面与手机宽度可选择文件、提交、轮询并查看每项状态与预览 | 保持现有默认语音页可用，UI 错误不得自动重复提交 |
| A-06 | 明确图片路径、规范化服务 | `normalize:batch` 命令、参数帮助和稳定退出码 | A-03 | 读取指定本地图片；写入输出目录；显式运行时调用 ZenMux | 离线替身验证执行顺序、输入过滤、已有结果跳过和失败退出码 | 任一显式文件失败时记录并非零退出，不自动付费重试 |
| A-07 | A-02 至 A-06 产物、仓库现有测试命令 | 环境占位符、操作文档、自动化测试与校验记录 | A-04,A-05,A-06 | 写入仓库；执行本地测试、类型检查和构建 | 定向测试、项目测试、类型检查/构建和 git diff --check 通过，或清楚隔离既有失败 | 修复本次引入问题；既有无关失败只记录，不扩展范围 |
| A-08 | 青年.png、老人2.png、老人-女2-远.png 和已验证流水线 | 最多三套规范图/元数据及视觉审查摘要 | A-07 | 已批准最多三次 ZenMux 付费请求；写入输出目录 | 先生成青年.png，身份五官服装背景无明显漂移且规格正确后，再各生成另外两张 | 首张明显漂移、provider 失败或响应异常即停止；绝不自动重试或生成额外候选 |

## 任务明细

- [x] T-01 | A-01 | 创建分支并固化规范化合同 | output: 独立分支及版本化规范常量/文档 | acceptance: 当前分支正确且合同包含尺寸、格式、构图、身份保持和禁止项
- [x] T-02 | A-02 | 实现输入校验、ZenMux 适配器与原子输出 | output: 可复用 TypeScript 包和三文件输出能力 | acceptance: 单元测试覆盖限制、参数、响应、尺寸格式和错误脱敏
- [x] T-03 | A-03 | 实现顺序队列、状态持久化与内容哈希幂等 | output: 五态任务记录和成功跳过能力 | acceptance: 相同成功输入二次提交不调用 provider
- [x] T-04 | A-04 | 增加本地规范化 HTTP API | output: 上传、列表与生成物读取端点 | acceptance: 多文件提交可查询且超限、错误类型和路径穿越被拒绝
- [x] T-05 | A-05 | 增加移动端友好的临时管理员页面 | output: `/normalize` 上传、状态及对比预览页面 | acceptance: 手机和桌面布局可用且默认语音页不回归
- [x] T-06 | A-06 | 增加串行批处理命令 | output: `normalize:batch` 命令、帮助和退出码 | acceptance: 离线替身证明串行、过滤、跳过及失败行为
- [x] T-07 | A-07 | 补齐环境示例、测试、文档并执行项目校验 | output: 配置说明、操作文档与校验记录 | acceptance: 定向测试、项目测试、检查、构建和差异检查均有可复核结果
- [x] T-08 | A-08 | 依闸门生成并审查最多三张真实规范图 | output: 最多三套输出和视觉审查摘要 | acceptance: 首张先验收，通过后才有后两张，所有输出规格正确且无明显核心特征漂移

## 发现与变更记录

- 2026-09-04 | 初始化获批执行追踪；根级 `AGENT.md` 缺失，按可用 `AGENTS.md` 与技能合同继续。
- 2026-09-04 | T-01 | evidence: type=command; locator=`git branch --show-current`; result=当前分支为 `codex/image-normalization-pipeline`，规范合同位于 `packages/image-normalization/src/contract.ts` 和 `docs/image-normalization.md`
- 2026-09-04 | T-02 | evidence: type=test; locator=`npm test` 中 image-normalization 输入/provider/脱敏测试; result=PNG/JPEG 转换、固定 ZenMux 参数、1024×1536 PNG 验证和敏感错误脱敏通过
- 2026-09-04 | T-03 | evidence: type=test; locator=`npm test` 中 queue is sequential, persists outputs, and skips a successful duplicate; result=单消费者最大并发为 1，相同成功内容二次提交为 skipped 且 provider 调用数不增加
- 2026-09-04 | T-04 | evidence: type=test; locator=`npm test` 中 normalization HTTP API submits, lists, and serves local assets; result=提交、列表、PNG 读取、Origin 限制和路径穿越拒绝全部通过
- 2026-09-04 | T-05 | evidence: type=manual; locator=2026-09-04 本地浏览器审阅 `http://127.0.0.1:5173/normalize`; result=上传控件、禁用提交态、任务空态和桌面布局可见，`npm run build` 同时证明现有语音页面与新页面可构建
- 2026-09-04 | T-06 | evidence: type=command; locator=`npm run normalize:batch -- --dry-run image/青年.png image/老人2.png image/老人-女2-远.png`; result=三张样本均按显式顺序通过解码，宽高为 941×1672，且没有供应商调用
- 2026-09-04 | T-07 | evidence: type=command; locator=`npm test`、`npm run build`、`npm audit --omit=dev --json`、`git diff --check`; result=47/47 测试通过，TypeScript 与 Vite 构建通过，生产依赖漏洞为 0，差异检查无错误；仓库指定的 Python 验证脚本和 tests 目录不存在并已记录跳过
- 2026-09-04 | 依赖审计发现 Sharp 0.34.5 存在无修复高危 libvips 公告，已替换为 `@napi-rs/canvas` 1.x；替换后 `npm audit --omit=dev` 为 0 项漏洞。
- 2026-09-04 | T-08 | evidence: type=artifact; locator=`AI_output/normalized/review.md` 及三个 `canonical.png`; result=严格先生成并目视通过青年样本，再串行生成两张老人样本；三次均 succeeded、均为 1024×1536 PNG、未自动重试，人工未观察到明显身份/年龄/五官/服装/场景漂移
- 2026-09-04 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-04 | state: IN_PROGRESS -> COMPLETED | reason: 全部验收通过

## 完成标准

- 所有未取消任务均勾选并具备结构化证据，所有 A-01 至 A-08 均有验收依据。
- 独立分支包含可复用服务、本地 API、移动端上传页、任务列表和串行 CLI，原始 `image/` 文件未被修改。
- 自动化校验结果可复核，输出和日志中无 `ZENMUX_API_KEY`、Authorization 或图片 Base64。
- 真实测试遵守最多三次、首张闸门和无自动重试；生成结果及人工审查摘要可供用户检查。
- A-01 | evidence: type=file; locator=`packages/image-normalization/src/contract.ts`; result=分支和版本化 1024×1536 PNG 人像规范合同已核验
- A-02 | evidence: type=test; locator=`npm test` 的 image-normalization provider/validation cases; result=输入转换、ZenMux 参数、结果尺寸格式和错误脱敏均通过
- A-03 | evidence: type=test; locator=`npm test` 的 queue sequential/idempotence case; result=顺序执行、文件持久化和成功重复跳过通过
- A-04 | evidence: type=test; locator=`npm test` 的 normalization HTTP API case; result=上传、任务列表、资源读取、Origin 和路径边界通过
- A-05 | evidence: type=manual; locator=2026-09-04 浏览器审阅 `http://127.0.0.1:5173/normalize`; result=上传区和三张成功任务的原图/规范图对比卡片可见
- A-06 | evidence: type=command; locator=`npm run normalize:batch -- --dry-run image/青年.png image/老人2.png image/老人-女2-远.png`; result=三个显式输入依次校验成功且真实运行按顺序输出三项 succeeded
- A-07 | evidence: type=command; locator=`npm test`、`npm run build`、`npm audit --omit=dev --json`、`git diff --check`; result=47 项测试、类型检查和构建通过，生产依赖漏洞为 0，差异检查无错误
- A-08 | evidence: type=artifact; locator=`AI_output/normalized/review.md`; result=三张指定样本各调用一次、无重试，均为 1024×1536 PNG 且人工对照无明显核心特征漂移
- overall | evidence: type=artifact; locator=`AI_output/normalized/review.md`、`docs/image-normalization.md`、`packages/image-normalization/`、`apps/web/src/NormalizationAdmin.tsx`; result=可复用服务、上传任务页、串行 CLI、离线验证和三套真实规范图均已交付，全部批准行动具有可复核证据
