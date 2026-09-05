---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: canonical-gate
plan_id: PT-canonical-gate
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03
approved_scope: A-01,A-02,A-03
approved_plan_digest: sha256:679b7def02579b2bde31f20803d327aac1d2e400f71c011032242919858d529f
routing_mode: auto
selected_modules: M-01,M-03
execution_status: COMPLETED
created_at: 2026-09-06
updated_at: 2026-09-06
---
# 标准图严格门禁执行
## 任务目标与批准快照
- 目标：原图基础检查，标准图严格验收。
- 主要诊断：精确定位前置导致原图误拒绝。
- 指导方针：迁移检查对象而非删除安全门禁。
- 近端目标：原图检测失败不阻止规范化；坏标准图不产生donor请求。
- 主动不做：付费生图、修改原图、覆盖旧资源、推送部署。
- 批准依据：用户明确全部批准PT-canonical-gate v1并执行。
- 路由快照：标准风险、可逆、流水线依赖明确。
- 已选模块：M-01,M-03。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03
## 变更范围
- 涉及模块或目录：scripts/portrait-motion、packages/role-resource、docs及隔离AI_output。
- 预计影响文件数：6至9。
- 允许的工具与权限：本地修改测试、缓存回放、只读复核，无付费。
- 禁止或需另行批准：生图和失败重试、覆盖历史资源、提交推送部署。
## 行动执行契约
| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | preflight代码及老人原图 | 原图检查结果与回归测试 | none | 获批后本地修改，无付费 | 格式尺寸解码等边界保留；不因478点检测失败硬拒绝规范化；日志不宣称五官已合格 | 基础文件检查失效则停止并恢复其安全限制 |
| A-02 | prepare与规范图缓存 | 标准图质量报告及明确错误 | A-01 | 获批后本地代码测试，无付费 | 标准图尺寸、单脸、五官坐标、倾斜、清晰度、遮罩检查通过后才允许四态；失败写明对象为标准图及检测数量 | 不合格标准图暂停角色，禁止后续局部生图，不用AI猜测补证据 |
| A-03 | 修改代码、mock、老人原图及三位标准图 | 测试结果与修正说明 | A-02 | 获批后无付费验证和文档修改、只读复核 | 证明原图预检通过不等于标准图合格；标准图失败不调用donor；已有成功图严格检查通过；更新老人历史误拒绝表述，保留原报告 | 不通过项如实报告，不能声称老人动画通过或所有图成功 |
## 任务明细
- [x] T-01 | A-01 | 将原图预检改为基础有效性检查 | output: 原图检查结果与回归测试 | acceptance: 格式尺寸解码等边界保留；不因478点检测失败硬拒绝规范化；日志不宣称五官已合格
- [x] T-02 | A-02 | 对标准图执行严格定位与清晰度检查 | output: 标准图质量报告及明确错误 | acceptance: 标准图尺寸、单脸、五官坐标、倾斜、清晰度、遮罩检查通过后才允许四态；失败写明对象为标准图及检测数量
- [x] T-03 | A-03 | 回归流程并更新说明 | output: 测试结果与修正说明 | acceptance: 证明原图预检通过不等于标准图合格；标准图失败不调用donor；已有成功图严格检查通过；更新老人历史误拒绝表述，保留原报告
## 发现与变更记录
- 2026-09-06 | T-03 | evidence: type=test; locator=docs/canonical-gate-fix-2026-09-06.md,AI_output/canonical-gate/preflight-matrix.json; result=17项Python和97项Node通过，tsc及diff检查通过；11张原图基础通过，三真实标准图新建及缓存严格检查通过；只读复核发现的缓存倾斜/重叠漏检已修正并复核无阻断；37条调用账本不变，无付费；旧原图误拒绝说明已勘误。
- 2026-09-06 | 验证边界：模板验证器scripts/validate_codex_template.py及根tests目录不存在，使用实际应用的Node/Python测试；未新增老人标准图，不声称老人动画通过。
- 2026-09-06 | T-01 | evidence: type=artifact; locator=AI_output/canonical-gate-source.json; result=90多岁男性原图基础检查通过，facialQualityAssessed=false，未调用模型；文件尺寸格式和解码拒绝测试通过。
- 2026-09-06 | T-02 | evidence: type=test; locator=scripts/portrait-motion/test_preflight.py,packages/role-resource/pipeline.test.ts,AI_output/canonical-gate/man/landmarks.json,AI_output/canonical-gate/woman/landmarks.json,AI_output/canonical-gate/side-man/landmarks.json; result=坏标准图在locate暂停且仅一次模拟normalize无donor；三真实标准图严格检查通过，零/多人检测数量明确；17Python测试及pipeline测试通过。
- 2026-09-06 | 初始化：精确获批步骤与无付费边界绑定；方案仅补验证器所需的ID表和失败信号标记，不改变语义。
- 2026-09-06 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-06 | state: IN_PROGRESS -> COMPLETED | reason: 全部验收通过

## 完成标准
- 老人原图基础检查通过；坏标准图零donor请求；已有三位标准图严格校验通过；原始记录保留、修正误拒绝说明；无付费调用。
- A-01 | evidence: type=artifact; locator=AI_output/canonical-gate-source.json; result=老人原图基础检查通过且facialQualityAssessed=false。
- A-02 | evidence: type=test; locator=scripts/portrait-motion/test_prepare.py,packages/role-resource/pipeline.test.ts; result=标准图严格门槛覆盖新建与缓存，失败暂停在donor之前。
- A-03 | evidence: type=artifact; locator=docs/canonical-gate-fix-2026-09-06.md; result=三真实标准图通过、17Python及97Node通过、勘误和限制已记录、复核无阻断。
- overall | evidence: type=artifact; locator=docs/canonical-gate-fix-2026-09-06.md; result=批准范围内门禁迁移及无付费验收完成，老人后续生图未执行，历史记录保留。
