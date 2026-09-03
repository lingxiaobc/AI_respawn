---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: product-prd-v1
plan_id: PT-product-prd-v1
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05,S-06
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06
approved_plan_digest: sha256:d0934b843d61a58889951e7d3b0ee7f28c438cb66fa14d726b2d75f74fde0920
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-04,M-05,M-07,M-08,M-09
execution_status: COMPLETED
created_at: 2026-09-03
updated_at: 2026-09-03
---

# 任务跟踪：AI Respawn 产品 PRD

## 任务目标与批准快照

- 目标：交付 `docs/product-prd.md`，将用户确认的产品目标、范围、流程、权限、数据隔离、视觉与语音验收、非功能要求和变更规则固化为后续开发的产品基线。
- 主要诊断：核心风险是跨原始照片、规范图、运行时动画、外部语音服务、发布授权和用户记忆的数据与状态语义漂移，而不是单纯缺少一个技术选型。
- 指导方针：使用技术中立、编号化、可追踪的产品单一事实源；按输入合格、资产就绪、管理员批准、用户授权、通话可用设置闸门。
- 近端目标：让产品、设计、前端、后端、算法和测试能从同一文档追溯每个核心流程、要求和验收。
- 主动不做：不修改应用代码；不强制 Live2D；不加入摄像头、用户表情识别、头身动作、复杂表情、音素口型、打断、全双工、背景音乐和知识库。
- 批准依据：用户于 2026-09-03 回复“批准并编写PRD文件”，批准计划 `PT-product-prd-v1` v1 的全部可见步骤。
- 路由快照：full 模式、自动路由、高风险、混合可逆性；未选择 M-06，因为本次无多代理或多人并行整合。
- 已选模块：M-01,M-02,M-03,M-04,M-05,M-07,M-08,M-09。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04; S-05 -> A-05; S-06 -> A-06

## 变更范围

- 涉及模块或目录：`docs/` 与 `TASK/<state>/product-prd-v1/`。
- 预计影响文件数：新增 1 个正式 PRD；新增并更新 2 个 PLAN/TASK 跟踪文件。
- 允许的工具与权限：仓库内 Markdown 编辑、任务跟踪验证与迁移脚本、只读检索、Git 差异与格式检查。
- 禁止或需另行批准：应用代码、模型资产、依赖、配置、凭据、外部服务、部署、发布、提交、推送、数据迁移及任何新增产品范围。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 用户确认需求、参考图观察、README 和现有验收资料 | PRD 的文档控制、产品概述、目标、术语、角色、现状与目标章节 | none | 读取仓库并编辑 docs/product-prd.md | 明确实时通话不是固定视频，区分原图、规范图和运行时帧，列出管理员与用户边界以及现有与缺失能力 | 若事实相互冲突则停止写入冲突结论，把冲突记录为待用户决定并暂停对应后续行动 |
| A-02 | A-01 的术语和角色边界、已确认业务流程 | PRD 的端到端流程、角色生命周期、音色状态、授权状态和通话状态章节 | A-01 | 编辑 docs/product-prd.md | 每条主流程都有前置条件、状态变化、成功结果和失败去向，未批准角色无法被用户调用 | 若状态存在无法闭合或越权路径则回到 A-01 修正术语或标记阻塞，不继续编造下游状态 |
| A-03 | A-01 角色边界、A-02 流程和状态 | 按模块组织的 FR、权限矩阵、数据实体与隔离、不成功路径章节 | A-01,A-02 | 编辑 docs/product-prd.md | 覆盖认证授权、角色管理、图片、音色、人格、异步任务、审核发布、用户角色列表、实时通话、记忆隔离和删除；每项使用唯一 ID | 若某项无法归属模块或角色则记录为开放问题并停止为其指定验收，不扩大产品范围 |
| A-04 | A-02 状态、A-03 功能要求、已确认效果边界和供应商事实 | 视觉与语音专项验收、发布门槛和失败反馈章节 | A-02,A-03 | 编辑 docs/product-prd.md | 明确照片拒绝条件、补肩条件、规范图批准基准、嘴眼可变区域、静音嘴型、音量驱动、眨眼、音色试听和半双工一问一答；不得要求音素口型或真人级效果 | 若验收依赖未选定技术才能描述，则改写为输出可观察结果；仍无法技术中立时列为技术验证项而非硬编码方案 |
| A-05 | 用户部署范围、当前规模、敏感数据类型、外部法规与供应商约束 | NFR、合规上线闸门、容量待定项、监控和降级要求章节 | A-03,A-04 | 编辑 docs/product-prd.md | 写明移动端主路径、TLS 和权限前提、真人照片与声音授权、删除审计、用户记忆隔离、容量实测和外部服务失败降级；未知数不伪装成承诺 | 若具体阈值无证据则标为上线前决策或验证项，并给出责任和触发时点，不自行填写数字 |
| A-06 | A-01 至 A-05 的全部 PRD 内容 | 追踪矩阵、MVP 非目标、待定决策、变更控制、发布门槛和经检查的 docs/product-prd.md | A-01,A-02,A-03,A-04,A-05 | 编辑 docs/product-prd.md 并运行只读或非破坏性检查 | 核心流程均映射到需求 ID 和验收项，无孤立核心要求、无互相矛盾状态、无未标注技术绑定；Markdown 与 git diff 检查无格式错误 | 若发现矛盾则仅在批准范围内回修受影响章节并重跑检查；若需要新增范围或承诺则暂停并请求新计划批准 |

## 任务明细

- [x] T-01 | A-01 | 编写文档控制、产品概述、目标、术语、角色和当前基线 | output: docs/product-prd.md 的第 1 至第 6 类基础章节 | acceptance: 实时 2D 通话、三类图像状态、角色边界与现状差距表述一致
- [x] T-02 | A-02 | 编写管理员、用户、生成审核、授权和通话流程及状态机 | output: docs/product-prd.md 的流程与状态章节 | acceptance: 主流程含前置、转换、成功和失败去向且未批准角色不可调用
- [x] T-03 | A-03 | 编写模块化 FR、权限矩阵、数据实体与异常处理 | output: docs/product-prd.md 的功能需求与数据规则章节 | acceptance: 11 类核心模块均有唯一需求 ID、权限归属和失败反馈
- [x] T-04 | A-04 | 编写视觉、动画、音色和实时语音专项验收 | output: docs/product-prd.md 的专项验收与发布门槛章节 | acceptance: 像素基准、可变区域、静音嘴型、音量驱动、眨眼、试听和半双工均可观察验证
- [x] T-05 | A-05 | 编写移动端、大陆部署、安全隐私、容量与降级要求 | output: docs/product-prd.md 的 NFR 和上线约束章节 | acceptance: 敏感数据授权删除隔离、移动端主路径、容量验证和外部服务降级均有明确闸门
- [x] T-06 | A-06 | 编写追踪矩阵、非目标、待定项、变更规则并校验全文 | output: 经一致性与格式检查的 docs/product-prd.md | acceptance: 四条核心流程可追踪到 FR 与 AC，待定项不伪装成承诺，检查无格式错误

## 发现与变更记录

- 2026-09-03 | 初始化 | 已保存用户批准的计划快照；尚未执行任何 PRD 行动。
- 2026-09-03 | 环境 | 系统无全局 Python，后续使用 Codex 工作区自带 Python 运行相同验证脚本，不改变权限或验收。
- 2026-09-03 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-03 | 环境限制 | `scripts/validate_codex_template.py` 与 `tests/` 在当前仓库不存在，因此仓库模板说明中的两项命令无法运行；没有将其记为通过。
- 2026-09-03 | T-01 | evidence: type=file; locator=docs/product-prd.md#1-文档控制至#6-信息架构与页面清单; result=产品定义明确为实时音频驱动的轻度可动 2D 人像，并区分管理员、用户、原图、规范图和运行时帧
- 2026-09-03 | T-02 | evidence: type=file; locator=docs/product-prd.md#7-端到端用户流程与#8-生命周期与状态机; result=管理员建角发布、多人分配、用户通话和删除均包含前置、状态转换、成功结果与失败去向
- 2026-09-03 | T-03 | evidence: type=file; locator=docs/product-prd.md#5-用户角色与权限、#9-功能需求、#12-数据模型与隔离规则及#13-异常处理与恢复; result=89 条唯一功能需求覆盖权限、角色、图片、音色、人格、任务、审核、列表、通话、记忆、删除审计与通知
- 2026-09-03 | T-04 | evidence: type=file; locator=docs/product-prd.md#10-人像与动画专项产品规格、#11-音色与实时语音专项产品规格及#15-验收标准; result=规范图基准、遮罩外零像素差、静音嘴型、输出音量驱动、眨眼、音色试听和半双工均有可观察验收
- 2026-09-03 | T-05 | evidence: type=file; locator=docs/product-prd.md#14-非功能需求、#16-发布门槛、#17-风险清单与最易失败点及#20-待定决策; result=移动端、大陆部署、授权删除隔离、容量、外部服务降级与上线合规闸门均已明确，未知阈值保留为 TBD
- 2026-09-03 | T-06 | evidence: type=command; locator=PowerShell PRD-CHECK and git diff --check in P:/codex_project/AI_respawn on 2026-09-03; result=906 行、89 条 FR、32 条 AC、无重复 FR/AC 声明，实时定义、零像素差、记忆隔离键和 Live2D 非绑定检查通过，Git 差异格式检查通过
- 2026-09-03 | A-01 | evidence: type=file; locator=docs/product-prd.md sections 1-6 and 18; result=文档控制、产品概述、目标、术语、角色和现状目标差距完整
- 2026-09-03 | A-02 | evidence: type=file; locator=docs/product-prd.md sections 7-8; result=五条业务链和四类状态机闭合，未批准角色不存在用户可用路径
- 2026-09-03 | A-03 | evidence: type=file; locator=docs/product-prd.md sections 5,9,12,13; result=权限、模块 FR、数据隔离和 13 类异常恢复均有明确归属
- 2026-09-03 | A-04 | evidence: type=file; locator=docs/product-prd.md sections 10,11,15; result=图片、嘴眼、音色和实时链路均转化为技术中立验收，不含音素口型或真人级效果要求
- 2026-09-03 | A-05 | evidence: type=file; locator=docs/product-prd.md sections 14,16,17,20; result=移动端、安全隐私、容量、可观察性、合规和外部依赖均设置发布或决策闸门
- 2026-09-03 | A-06 | evidence: type=command; locator=PowerShell declaration/link checks and git diff --check in P:/codex_project/AI_respawn on 2026-09-03; result=4 个本地文档链接存在，关键产品合同存在，需求声明无重复且格式检查通过
- 2026-09-03 | overall | evidence: type=artifact; locator=docs/product-prd.md; result=23 个主章节形成获批产品基线，覆盖目标、非目标、流程、状态、权限、FR、数据、专项验收、NFR、风险、TBD、发布门槛、追踪与变更控制
- 2026-09-03 | state: IN_PROGRESS -> COMPLETED | reason: 全部验收通过

## 完成标准

- 所有 T-01 至 T-06 均完成并各有结构化证据。
- 每个 A-01 至 A-06 均有对应完成证据，依赖顺序闭合。
- `docs/product-prd.md` 存在且包含目标、非目标、角色权限、流程状态、FR、数据、视觉与语音验收、NFR、风险、待定、发布门槛、追踪和变更控制。
- PRD 不把 Live2D 或其他候选实现写成产品硬依赖，不加入未批准功能，不把未知阈值写成承诺。
- 计划、任务跟踪、Markdown 内容和 Git 差异检查通过；未覆盖或不能证实的事项明确列为限制或待定。
- A-01 | evidence: type=file; locator=docs/product-prd.md sections 1-6 and 18; result=文档控制、产品概述、目标、术语、角色和现状目标差距完整
- A-02 | evidence: type=file; locator=docs/product-prd.md sections 7-8; result=管理员建角发布、多人分配、用户通话、删除和四类状态机闭合
- A-03 | evidence: type=file; locator=docs/product-prd.md sections 5,9,12,13; result=89 条 FR 覆盖权限、模块、数据隔离和失败恢复且声明无重复
- A-04 | evidence: type=file; locator=docs/product-prd.md sections 10,11,15; result=图片、嘴眼、音色和实时链路均有技术中立的专项验收
- A-05 | evidence: type=file; locator=docs/product-prd.md sections 14,16,17,20; result=移动端、安全隐私、容量、合规、风险和外部依赖均有闸门或待定决策
- A-06 | evidence: type=command; locator=PowerShell PRD-CHECK, local-link check and git diff --check in P:/codex_project/AI_respawn on 2026-09-03; result=906 行、89 条 FR、32 条 AC、4 个本地链接存在，关键合同和差异格式检查通过
- overall | evidence: type=artifact; locator=docs/product-prd.md; result=23 个主章节形成完整 MVP 产品基线并满足全部获批步骤
