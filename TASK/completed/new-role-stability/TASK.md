---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: new-role-stability
plan_id: PT-new-role-stability
plan_version: 4
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05
approved_scope: A-01,A-02,A-03,A-04,A-05
approved_plan_digest: sha256:ff44dc4c6639d3ba023a4688152732bde152ca76c03f9abbe3dcafb63f0b8986
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-05,M-07,M-08
execution_status: COMPLETED
created_at: 2026-09-05
updated_at: 2026-09-06
---

# 全新角色稳定性执行记录

## 任务目标与批准快照

- 目标：5张新图逐项报告，至少3个合格新角色全链路通过。
- 主要诊断：少量且修正后成功的样本不足以证明泛化，缓存掩盖首次结果。
- 指导方针：合同与证据优先、通用修复全体回归、失败暂停不重复付费。
- 近端目标：真实首次链路与Ubuntu CPU可验证恢复，峰值目标1.5GiB。
- 主动不做：人物特判、手工修图、额外云端决策、旧失败重试、生产部署、提交推送。
- 批准依据：用户2026-09-05明确“批准并执行PT-new-role-stability v1中的任务”，含Q-01上限39次/本轮最多25次首次调用。
- 路由快照：标准风险/混合可逆性；强依赖、缓存惯性、跨样本未知；主线程写入、只读复核。
- 已选模块：M-01,M-02,M-03,M-05,M-07,M-08。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04; S-05 -> A-05

## 变更范围

- 涉及模块或目录：scripts、packages、apps、docs及隔离AI_output。
- 预计影响文件数：15至25文件。
- 允许的工具与权限：本地读写/测试、ZenMux限额首次调用、本机Ubuntu和只读审查；根.env唯一配置来源。
- 禁止或需另行批准：禁止泄露密钥、覆盖原图历史账本、自动重试、部署/提交/推送；扩大额度或输入合同需另批。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 11张现有图片、已有资源和代码 | 源哈希/版本清单、新旧分类、预检结果与预期标签 | none | 批准后本地读写，不付费 | 5张新增逐一记录，全部11张预检；肩膀朝向不冒充脸部不可见，模糊/多人/缺五官衍生负例只在隔离输出生成 | 若标签或输入边界不明，保留边界标签，不先付费或放宽要求 |
| A-02 | 流水线、接收器、调用账本、测试 | 脱敏阶段事件、故障注入测试、版本/缓存失效规则 | A-01 | 批准后代码/测试修改与本地mock，不修改历史账本或发付费请求 | 覆盖头前断开、流中断、完整返回但落盘失败、畸形数据、重启与重复提交；不误报成功、不自动重发；代码版本变化不得静默信任过期派生资源，保留旧资源 | 缺少平台证据就记录unknown；不能安全恢复则暂停并保留数据，返回设计层修正 |
| A-03 | 40多岁男性原图、固定模型/提示词、修复后的代码 | 原图到动画12阶段记录、原始素材、失败及修复回归 | A-02 | Q-01已批准；该图5次首次生图加用户2026-09-05授权的normalize手动重试1次，发送至ZenMux | 不用旧规范图冒充新生图；1024x1536、单结果、63帧遮罩外零变化、嘴幅度门禁和浏览器QA通过；无手工修图或人物特判 | 生图失败暂停该角色；本地错误用缓存复现、通用修复、旧青年/女性回归，禁止静默换图或重发生图 |
| A-04 | 其余4张新增图片、首图通过的代码 | 逐图结果矩阵与动画、首次/修复后分别统计 | A-03 | Q-01批准额度内，每图首次最多5次；不含历史失败重试 | 5图都有结论，至少3个合格新角色完成；保留样本不人工调参，若改代码则新旧成功素材全部回归；拒绝样本单列，不算生成成功 | 新失败保留证据并暂停该角色；若明确仅该图问题可串行测试下一独立样本，共性安全问题先停止整批 |
| A-05 | 成功缓存、隔离Ubuntu、测试和预览工具 | 单图网页新角色证据、Ubuntu报告、对比图库、稳定性报告和运行说明 | A-04 | 本机隔离验证、无付费、独立只读复核；不部署/提交/推送 | UI上传至少1个新角色走共享后端；Ubuntu新素材CPU复跑、工作组峰值目标<=1.5GiB；Node/Python/类型检查与故障测试通过；每图身份/自然度待用户确认；报告首次率与修复后率及限制 | 环境或资源未达标则明确记录未完成和阻断点；不以Windows回放冒充Ubuntu或真实新生图 |

## 任务明细

- [x] T-01 | A-01 | 建立测试矩阵与基线 | output: 源哈希/版本清单、新旧分类、预检结果与预期标签 | acceptance: 5张新增逐一记录，全部11张预检；肩膀朝向不冒充脸部不可见，模糊/多人/缺五官衍生负例只在隔离输出生成
- [x] T-02 | A-02 | 加固失败观测与安全恢复 | output: 脱敏阶段事件、故障注入测试、版本/缓存失效规则 | acceptance: 覆盖头前断开、流中断、完整返回但落盘失败、畸形数据、重启与重复提交；不误报成功、不自动重发；代码版本变化不得静默信任过期派生资源，保留旧资源
- [x] T-03 | A-03 | 执行首张全新角色并优化通用几何 | output: 原图到动画12阶段记录、原始素材、失败及修复回归 | acceptance: 不用旧规范图冒充新生图；1024x1536、单结果、63帧遮罩外零变化、嘴幅度门禁和浏览器QA通过；无手工修图或人物特判
- [x] T-04 | A-04 | 用其余新图验证冻结版本 | output: 逐图结果矩阵与动画、首次/修复后分别统计 | acceptance: 5图都有结论，至少3个合格新角色完成；保留样本不人工调参，若改代码则新旧成功素材全部回归；拒绝样本单列，不算生成成功
- [x] T-05 | A-05 | 完成Ubuntu复验和交付审查 | output: 单图网页新角色证据、Ubuntu报告、对比图库、稳定性报告和运行说明 | acceptance: UI上传至少1个新角色走共享后端；Ubuntu新素材CPU复跑、工作组峰值目标<=1.5GiB；Node/Python/类型检查与故障测试通过；每图身份/自然度待用户确认；报告首次率与修复后率及限制

## 发现与变更记录

- 2026-09-05 | T-04 | evidence: type=artifact; locator=AI_output/gemini-stability-review/evidence.json; result=5图逐项结论，3位新角色同指纹696215e4完成12阶段；1位网络失败暂停、1位预检拒绝；本轮17次Gemini中16图成功，累计37/40，首次全链1/4修复后3/4；通用配准/候选搜索修复不重生图，新旧成功角色全部同版回归。
- 2026-09-05 | T-05 | evidence: type=artifact; locator=AI_output/stability-linux/man-verified-memory.json,AI_output/stability-linux/woman-verified-memory.json,AI_output/stability-linux/side-man-verified-memory.json,AI_output/role-ui-test/gemini-stability-final/ui-qa/report.json,docs/gemini-stability-validation-2026-09-05.md; result=3新角色Ubuntu均12阶段通过，峰值约0.98/0.99/1.00GiB；最终版真实新图网页上传复用已校验缓存、预览及390px检查通过；96Node/14Python/tsc通过；独立复核无安全阻断，近景对照图已目视，运动自然度留给用户确认。
- 2026-09-05 | 当前结论：按至少3个成功及失败可解释的既定技术验收完成，不代表所有角色成功或用户自然度已确认。侧身女性cd12fcde账本保留UND_ERR_SOCKET失败，未重发；付费开关0，未提交推送部署。逐轨道ECC缺专门逐错误路径单测，真实新旧集成回归通过；此覆盖限制写入报告。

- 2026-09-05 | T-03 | evidence: type=artifact; locator=AI_output/stability-v1/roles/e84adf51-d433-4abc-a172-5917477c6574/job.json,AI_output/stability-v1/gemini-regression; result=首图真实5次Gemini成功完成12阶段，63帧遮罩外0，嘴比0.0051/0.1089/0.2118，浏览器通过；缓存加固后首图和旧青年/女性均12阶段待人审，无新增调用，无人物特判。
- 2026-09-05 | 用户追加批准累计上限40次（原39加1），仅供剩余三张合格新图各最多5次，不含失败重试。远景老人仍预检拒绝。当前25次。女性回归首次命令用了不存在的源路径在读文件阶段报ENOENT，核对路径后完成；没有产生API请求。

- 2026-09-05 | 用户明确使用Gemini继续已批准PT-new-role-stability v1任务，更新规范快照v3以保留模型变更证据；原验收不变。Gemini权限修正后两次素材请求成功，累计20/39。本轮直接Gemini，不消耗GPT请求，不自动重试。T03至T05仍未验收。

- 2026-09-05 | 新用户增量要求：GPT请求错误可回退google/gemini-3-pro-image，并直接试该模型2次。此授权替换旧“不得自动换模型”边界；已另记docs/gemini-fallback-test-2026-09-05.md，主任务仍PAUSED。两次真实Gemini于北京时间23:11:02/23:11:09返回HTTP403，无图，累计18/39；未第三次调用，paid恢复0。回退/账本/协议共94Node测试及tsc通过，不将回退代码完成等同新图动画通过。

- 2026-09-05 | v2重试结果：提权执行首图，新角色aca14f24-e83f-4a90-a476-3fbdb30c9f80；北京时间22:50:50.140至22:51:50.243，normalize于60097ms报UND_ERR_SOCKET，无HTTP头/requestId/图片。replacement账本后缀-approved-retry-1保留failed-or-unknown，原记录不动；16/39次，paid恢复0，无二次重试。首图闸门未通过，T03/T04/T05保持未完成。
- 2026-09-05 | T-02 | evidence: type=test; locator=packages/role-resource/recovery.test.ts; result=精确授权替代尝试的disabled/一次成功/缓存复用/原账本字节不变测试通过；全套88项Node及tsc通过；只读review_motion_safety确认失败replacement在provider之前硬拒绝重入。
- 2026-09-05 | 本地回归进展：scripts/role-replay.ts强制禁付费回放，青年08df4a22-b6e1-43b3-93c2-15a034a3d6b8与女性5438bfcb-685e-49ef-bdd4-beae8026e87a均完成12阶段到awaiting_review，报告在AI_output/stability-v1/regression-{youth,female}-final/replay-report.json；不等于新增角色真实生图成功。

- 2026-09-05 | v2增量批准：用户明确授权重试并继续；只增加首张normalize一次显式替代尝试，原失败保留、总上限39不变。本次无密钥沙箱内GET仍EACCES，需要按执行权限工具进行沙箱外运行。

- 2026-09-05 | T-02 | evidence: type=test; locator=packages/role-resource/version.test.ts; result=补齐提示词/合同/缓存/验证等直接行为依赖指纹，每个依赖变化都改变版本；全套87项Node测试、12项Python及tsc通过。
- 2026-09-05 | A-03暂停：首张新图角色a3b2051a-e812-4f46-a4d9-dffe1f8fcd97在normalize于29ms发生EACCES且HTTP none，账本d3182972ea563c4a8cf8d1ab2e96789a5d6545b2c77bd9bd3a1e4fa5739d04b5保留失败/未知；累计15/39。无密钥GET沙箱内53ms connect EACCES 198.18.0.38:443，批准沙箱外432ms HTTP200。未重发生图、未进入依赖A04；根.env付费开关已恢复0。详见docs/new-role-stability-progress.md，等待明确一次性手动重试授权。

- 2026-09-05 | T-01 | evidence: type=artifact; locator=AI_output/stability-v1/preflight-matrix.json; result=11张原图逐一检查，10通过、远景90多岁男性未检测出唯一人脸而拒绝；3衍生负例全部拒绝；记录原图哈希、预期分组及代码基线，无付费。
- 2026-09-05 | T-02 | evidence: type=test; locator=packages/role-resource/recovery.test.ts,packages/role-resource/pipeline.test.ts; result=86项Node和12项Python测试及tsc通过；头前断开/流断开/落盘失败/坏图片均保留阶段并禁止重复付费；旧派生版本拒绝执行并保留检查点；原有重复提交与重启测试通过。


- 2026-09-05 | 初始化：原始新增5图已目视检查，旧代码变更保留，计划与调用上限已获批准。实际执行证据尚未产生。
- 2026-09-05 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-05 | state: IN_PROGRESS -> PAUSED | reason: 首图规范化请求沙箱内EACCES，保留失败账本；首次调用批准不含重试，等待一次性沙箱外重试授权
- 2026-09-05 | state: PAUSED -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-05 | state: IN_PROGRESS -> PAUSED | reason: 授权重试已执行，沙箱外normalize于60.097秒UND_ERR_SOCKET无响应；等待平台对应请求记录或可恢复结果，不自动第二次重试
- 2026-09-05 | state: PAUSED -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-06 | state: IN_PROGRESS -> COMPLETED | reason: 全部验收通过

## 完成标准

- A-01 | evidence: type=artifact; locator=AI_output/stability-v1/preflight-matrix.json; result=11原图及3负例预检保留，5新增全部归类。
- A-02 | evidence: type=test; locator=packages/role-resource/recovery.test.ts,packages/role-resource/fallback.test.ts; result=故障、模型分账本、直连不GPT、缓存损坏零调用及版本保护通过；总96项Node通过。
- A-03 | evidence: type=artifact; locator=AI_output/stability-v1/roles/35279795-f547-420f-bd99-bf060d6ab06c/job.json; result=首新图真实素材已在最终版本12阶段成功，63帧遮罩外0，历史失败与首次成功都保留。
- A-04 | evidence: type=artifact; locator=AI_output/gemini-stability-review/evidence.json; result=3新角色同版成功、5图全报告、首次/修复后率分别1/4和3/4，旧青年女性最终回归通过。
- A-05 | evidence: type=artifact; locator=AI_output/gemini-stability-review/latest.html,docs/gemini-stability-validation-2026-09-05.md; result=审查页、3角色Ubuntu内存及网页证据交付；身份自然度待用户确认，未冒称生产实测。
- overall | evidence: type=artifact; locator=AI_output/gemini-stability-review/evidence.json; result=technicalTargetMet=true，3同版新角色各12阶段及Ubuntu通过，累计37/40，第四角色网络失败保留而非伪报成功。

- 5张新图有逐项结论，至少3个合格全新角色最终同版完成12阶段；63帧遮罩外0且嘴幅度/浏览器门禁通过；故障无重复调用；新旧缓存回归；Ubuntu CPU及1.5GiB目标实测；图库与首次/修复后结果交付，用户自然度确认独立保留。
