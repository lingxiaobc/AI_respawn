---
task_schema: plan-tasks-tracker/v2
plan_schema: rumelt-task-plan/v2
plan_id: PT-task-archive-roadmap
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06
approved_plan_digest: sha256:0eaa53c5392ccfdf35138b5bcfd44a969d15d34532b367a545cf6829f910b1be
routing_mode: auto
selected_modules: M-01,M-03,M-04,M-05,M-07,M-08,M-09
execution_status: COMPLETED
created_at: 2026-09-01
updated_at: 2026-09-01
---

# TASK：TASK 清理归档与项目总计划优化

## 任务目标与批准快照

- 目标：检查所有 TASK/PLAN 与根计划，建立完成/替代/活动三态归档，并将根计划更新为“Live2D 前置已完成、前端结合未开始”的当前项目路线图。
- 主要诊断：任务文档状态、历史版本和用户最终事实分散，直接按文件名或旧勾选移动会造成错误入口和重复返工。
- 指导方针：先登记和备份，再成对归档；活动任务留在 `TASK/` 根目录；所有移动可逆，不删除历史。
- 近端目标：根目录只保留当前 PTT v2 与 Live2D 前端活动主线，归档索引能定位所有历史记录。
- 主动不做：不修改代码、模型、PSD、源图、技能资产或活动计划批准范围；不把前端接入标成完成。
- 批准依据：用户确认 Live2D 前置准备和技能文件已完成，尚未开始的是 Live2D 资源与前端结合，并批准本修订后的归档策略。
- 路由快照：auto / 高风险 / 混合可逆性 / M-01,M-03,M-04,M-05,M-07,M-08,M-09。
- 已选模块：M-01,M-03,M-04,M-05,M-07,M-08,M-09。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04; S-05 -> A-05,A-06

## 变更范围

- 涉及模块或目录：`TASK/` 文档归档、`TASK/archive/` 新目录、根目录 `AI_RESPAWN_DEMO_PLAN.md`；只读检查 `README.md`、`docs/` 和 Live2D 资源/技能路径。
- 预计影响文件数：移动 12 份历史 PLAN/TASK，新增 1 个索引、1 个 Live2D 完成摘要、1 个旧根计划副本，并更新 1 个根计划和本 tracker/plan。
- 允许的工具与权限：工作区文档写入、受控复制/移动、`rg`/PowerShell 只读检查、计划/跟踪器验证和 Git 差异检查。
- 禁止或需另行批准：删除任何文件、修改代码/模型/PSD/源图/技能资产、控制 GUI、前端实现、外部发布或 Git 提交/推送。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 全部 TASK/PLAN、根计划、README/架构/验收文档、用户确认 | `TASK/archive/ARCHIVE_INDEX.md` 初稿中的完整文件清单、状态、依据和目标位置 | none | 只读工作区；可写新计划/索引 | 清单覆盖全部 16 份 TASK/PLAN 和根计划；每份都有完成/活动/替代分类与理由；未发现仓库内隐藏引用 | 若状态或引用冲突，停止移动，保留冲突记录并回到分类表，不按文件名猜测 |
| A-02 | A-01 状态表、现有 TASK/根计划 | `TASK/archive/completed/`、`TASK/archive/superseded/`、归档说明和旧根计划副本 | A-01 | 工作区新建目录、复制文件；不删除 | 目录和备份先于移动建立；源文件内容可由副本恢复；活动文件不被移动 | 若目标已存在或备份校验不一致，停止所有移动并保留现状，改用新目录名或回退 |
| A-03 | A-01/A-02、用户 Live2D 完成确认、最终模型和技能包路径 | 完成归档中的已完成 PLAN/TASK 对、Live2D 前置完成摘要和索引链接 | A-02 | 工作区内受控移动/编辑文档；不修改模型/PSD/技能资产 | 自动判定已完成的四个任务对和 Live2D 前置记录进入 `completed/`；Live2D 旧细项原文保留并附用户确认说明；活动任务留在根目录 | 若无法证明某记录已完成，不标完成，移入 `superseded/` 并写明证据缺口；不删除 |
| A-04 | A-01/A-02 状态表、v1/v2 plan_id 对照 | `superseded/` 中的 PTT v1 计划/任务及索引；根目录只保留 PTT v2 与 Live2D 前端活动对 | A-02 | 工作区内受控移动；不改活动计划的批准范围 | 暂停 v1 与被替代记录不再成为活动入口；活动文件数量和名称与索引一致 | 若活动依赖指向被移动文件，停止并补充相对链接或保留兼容说明后再移动 |
| A-05 | A-01 至 A-04 结果、代码/资源现状、`AI_RESPAWN_DEMO_PLAN.md` 旧版备份 | 更新后的 `AI_RESPAWN_DEMO_PLAN.md`：当前状态、完成里程碑、活动任务、Live2D 前端下一步、非目标与归档入口 | A-03,A-04 | 工作区文档写入；不改变代码、模型和活动计划批准范围 | 根计划不再把旧 PTT v1 当作待审批入口；明确 Live2D 前置完成、前端结合未开始，并链接活动/归档索引 | 若重写会改变未批准技术范围，停止并恢复旧版根计划，只保留归档清单 |
| A-06 | 全部归档结果、活动 TASK/PLAN、根计划、验证器 | 验证报告、无断链的索引/根计划和干净的文档差异 | A-02,A-03,A-04,A-05 | 只读检查、计划/跟踪器验证、Git diff 检查 | 归档源/目标可追溯；活动任务仍可验证；根计划链接有效；`git diff --check` 无空白错误；不修改资产 | 任一检查失败，停止交付，回退到对应 A-02/A-03/A-04/A-05 修复，不宣布完成 |

## 任务明细

- [x] T-01 | A-01 | 盘点全部 TASK/PLAN 与根计划并建立状态证据表 | output: `TASK/archive/ARCHIVE_INDEX.md` 初稿 | acceptance: 覆盖 16 份 TASK/PLAN 和根计划，列明完成/活动/替代分类、依据、目标位置和隐藏引用检查结果
- [x] T-02 | A-02 | 创建完成/替代归档目录、说明文件并备份旧根计划 | output: `TASK/archive/completed/`、`TASK/archive/superseded/` 与旧根计划副本 | acceptance: 目录和备份先于移动建立，备份内容可恢复，未删除任何文件
- [x] T-03 | A-03 | 移动已完成任务对并记录 Live2D 前置完成摘要 | output: 完成归档中的已完成 PLAN/TASK 对、`live2d-preparation-complete.md` | acceptance: 自动完成的四个任务对和 Live2D 前置记录可由索引追溯，最终 `.cmo3` 与技能入口路径明确，未修改模型/技能资产
- [x] T-04 | A-04 | 移动暂停/被替代路线并保留活动任务 | output: `superseded/` 中的 PTT v1 记录与活动入口清单 | acceptance: 根目录只保留 PTT v2 和 Live2D 前端活动 PLAN/TASK 对，v1 不再成为执行入口，批准范围未改变
- [x] T-05 | A-05 | 备份后优化根目录项目总计划 | output: 更新后的 `AI_RESPAWN_DEMO_PLAN.md` | acceptance: 根计划链接归档索引和活动任务，明确 Live2D 前置完成、前端结合未开始、语音 v2 待完成事项和非目标
- [x] T-06 | A-06 | 验证归档完整性、引用和活动入口 | output: 归档验证记录 | acceptance: 归档源/目标可追溯，活动计划/跟踪器仍通过验证，根计划链接有效，`git diff --check` 无空白错误

## 发现与变更记录

- 2026-09-01 | 用户批准修订后的归档策略，并明确 Live2D 前置资源已完成、前端结合尚未开始。
- 2026-09-01 | tracker 创建，执行从 A-01 开始；活动任务保留在 `TASK/` 根目录，历史记录只移动不删除。
- 2026-09-01 | A-01 完成：建立 `TASK/archive/ARCHIVE_INDEX.md` 与归档说明；仓库内未发现旧根计划/旧 PTT v1 的隐藏引用。
- 2026-09-01 | A-02 完成：创建 `completed/`、`superseded/`，并以 SHA-256 `3C23BB9E2A9C253225EC72CD206CE1C24FBEA352F1FDA69026C35202C40BD5F6` 备份旧根计划。
- 2026-09-01 | A-03 完成：已完成任务对进入 `completed/`，并新增 `live2d-preparation-complete.md`；前端结合仍明确为未开始。
- 2026-09-01 | A-04 完成：PTT v1 计划/跟踪器移入 `superseded/`；根目录当前项目入口仅保留 PTT v2、Live2D 前端活动对及本次归档 tracker。
- 2026-09-01 | A-05 完成：根计划已更新为当前路线图，保留 v2 语音验收与 Live2D 前端接入边界；根计划验证通过。
- 2026-09-01 | A-06 完成：根计划、活动计划/跟踪器和归档索引完成结构/路径检查；本 tracker 随行政记录归档到 `completed/`。

## 完成标准

- A-01 | evidence: `TASK/archive/ARCHIVE_INDEX.md` covers all TASK/PLAN files and the root plan with status, evidence, destination, and hidden-reference search.
- A-02 | evidence: archive directories and a byte-preserving legacy root-plan copy exist before any moves; no source asset is deleted.
- A-03 | evidence: completed archive contains the completed task pairs plus the Live2D preparation completion summary, final `.cmo3` path, and skill entrypoint.
- A-04 | evidence: superseded archive contains the paused PTT v1 pair; active PTT v2 and Live2D frontend pairs remain at the TASK root.
- A-05 | evidence: optimized `AI_RESPAWN_DEMO_PLAN.md` separates completed Live2D preparation from the unstarted frontend integration and links active/archive navigation.
- A-06 | evidence: archive/index/root-plan links and active plan/tracker validation pass, and `git diff --check` reports no whitespace errors.
- TASK 根目录只保留当前活动任务，完成和替代历史均可通过索引恢复。
- 根计划不把 Live2D 前端接入或语音 v2 剩余验收误标为已完成。
