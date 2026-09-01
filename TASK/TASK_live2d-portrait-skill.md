---
task_schema: plan-tasks-tracker/v2
plan_schema: rumelt-task-plan/v2
plan_id: PT-live2d-portrait-skill
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05,S-06,S-07
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06,A-07
approved_plan_digest: sha256:9a8f0f77f7fcbf088784c33350628e105791e577171ce768b8d5cf1f6770209a
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-04,M-05,M-06,M-07,M-08
execution_status: COMPLETED
created_at: 2026-09-01
updated_at: 2026-09-01
---

# TASK：可复用 Live2D 写实人像制作技能

## 任务目标与批准快照

- 目标：将参考照片、局部 donor、全脸非空底图 PSD、Cubism 参数设置、失败诊断和重开验收流程整理成可复用仓库级技能包，并以当前成功模型和受控故障夹具回归。
- 主要诊断：返工根因是人物参数、架构不变量和历史废弃规则混杂，且 PSD 导入前缺少质量闸门；错误会被 Cubism 参数放大。
- 指导方针：证据登记→通用契约→自动检查→人工 Cubism 闸门→重开验收；全脸非空底图、原图保护和可回退性优先。
- 近端目标：技能能针对新参考图生成输入/图层契约、检查报告、Cubism 速查表和失败回退路径，且成功/失败样本可验证。
- 主动不做：不采用挖空底图、全脸 AI 重绘、未经蒙版限制的 donor、自动控制 Cubism、前端运行时、发布或 Git 提交。
- 批准依据：用户明确回复“批准并执行”，并追加“底图一律用全脸非空底图”。
- 路由快照：不确定性中高；照片→蒙版→PSD→Cubism 为强串行质量链；技能文件可回退但 PSD/模型误操作有混合风险；范围需跨人物泛化；旧规则惯性显著；PSD 编码与人工 GUI 有交接风险。
- 已选模块：M-01,M-02,M-03,M-04,M-05,M-06,M-07,M-08。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04; S-05 -> A-05; S-06 -> A-06; S-07 -> A-07

## 变更范围

- 涉及模块或目录：`.agents/skills/live2d-portrait-rigging/`、`TASK/PLAN_live2d-portrait-skill.md`、`TASK/TASK_live2d-portrait-skill.md`；只读参考 `AI_output/live2d/`。
- 预计影响文件数：新建一套技能入口、参考文档、验证脚本和测试夹具，以及两份 TASK 文档；不覆盖现有 Live2D 资产。
- 允许的工具与权限：工作区写入、Python/PowerShell 本地检查、读取现有 PNG/PSD/`.cmo3` 和文档、用户手动使用 Cubism Editor。
- 禁止或需另行批准：覆盖源图/PSD/模型、修改现有模型、控制用户 GUI、进入前端或发布、Git 提交、外部发送、购买软件或商业许可承诺。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | `AI_output/live2d` 资产、ART_SPEC、ASSET_MANIFEST、LAYER_MAP、历史 PLAN/TASK、用户最终验收 | 可追溯的事实/未知/假设/有效规则/废弃规则清单 | none | 只读工作区与用户已提供证据；可写新计划/技能目录 | 每条通用规则都有来源和适用边界；挖空底图、交叉淡化、重复层名、错误编码、错误绑定均标为失败路线；不把旧未完成项当成事实 | 发现来源冲突时暂停抽取，保留两种解释并回到 D-01；不先写操作步骤 |
| A-02 | A-01 规则账本、新参考图的尺寸/色彩/构图信息、局部目标 | `references/input-and-art-contract.md`，含全脸非空底图、局部编辑边界、命名和证据要求 | A-01 | 工作区写入；不修改用户源图 | 契约可区分原图、工作副本、局部 donor、最终层；支持不同尺寸与坐标；明确蒙版外差异为零、独立半态素材和停止条件 | 若某条规则只能解释当前人物，降级为样例并标记参数；不硬编码为通用要求 |
| A-03 | A-01/A-02 契约、最终十层结构、成功 `.cmo3` 验收记录、PSD 失败样本 | `references/psd-layer-contract.md` 与参数/透明度/绘制顺序模板 | A-01,A-02 | 工作区写入；只读解析 PSD/PNG/`.cmo3` | 强制 `static_locked_base` 全脸非空；十层命名、全画布、Alpha、色彩空间、默认层为 0% 的累积覆盖表、参数独立性和重开验收均有明确检查项 | 自动组装或编码在实机不可证实时，停止承诺全自动，保留透明 PNG 权威源并切换为“脚本验证＋人工 PSD 组装” |
| A-04 | A-02/A-03 契约、Skill Creator 结构要求、仓库技能目录约定 | `.agents/skills/live2d-portrait-rigging/SKILL.md` 与 `agents/openai.yaml` | A-02,A-03 | 只写仓库技能目录；不写全局目录 | 描述可在不同人像任务中正确触发；入口只含目的、边界、阶段选择、停止条件和参考文件路由；不加载无关资料；默认保持隐式可发现 | 触发范围过宽或把前端任务误吸入时，收窄描述和边界；不靠增加正文解决路由问题 |
| A-05 | A-01/A-02/A-03、当前成功流程和失败时间线 | `references/psd-design.md`、`references/cubism-rigging.md`、`references/pitfalls-and-recovery.md` | A-03,A-04 | 工作区写入；引用现有资产只读 | 文档覆盖从参考图到重开 `.cmo3` 的阶段、输入输出、人工交接、检查点、失败信号和回退；最终只推荐全脸非空底图架构 | 发现文档与验证器/成功模型不一致时，暂停后续测试，先修正规则注册表或契约 |
| A-06 | A-01/A-02/A-03、当前 PNG/PSD 样本、受控合成坏样本 | `scripts/audit_portrait_assets.py`、`scripts/build_state_contact_sheet.py`、必要的 PSD/Alpha 检查器及测试夹具 | A-01,A-02,A-03 | 工作区写入；本地执行；不触碰用户源资产 | 能报告尺寸/色彩、图层名重复、全脸底图非空、Alpha 覆盖、蒙版外差异、参数/状态覆盖和联系表；坏样本按预期失败，成功样本通过 | 解析库或 PSD 编码不可稳定支持时，缩小脚本职责到可验证的 PNG/manifest/diff，并在参考手册明确人工闸门 |
| A-07 | A-04/A-05/A-06 产物、当前成功模型、故障夹具、一个不同参数化输入 | 通过 `quick_validate.py` 的技能包、测试报告、回归记录和使用边界 | A-04,A-05,A-06 | 本地只读验证与工作区测试写入；不发布、不提交 | 技能结构/前端元数据/引用路径有效；当前样本无回归；故障夹具被拦截；走读能在进入 Cubism 前阻断至少四类历史错误；未把前端或发布纳入技能 | 任一关键错误未被拦截，tracker 暂停，回到对应契约/脚本/参考文档层修订；若需扩大范围则重新规划并请求批准 |

## 任务明细

### 执行规则

- 一次只推进最早的未完成行动；依赖行动未验收前不得进入下游。
- 新人物的坐标、ROI、颜色、donor 文件名和尺寸只能作为输入参数或样例，不得写成全局不变量。
- 全脸非空底图是硬闸门；任何挖空底图或默认局部层常驻替代方案均直接失败。
- 发现会改变诊断、范围、权限、验收或外部影响的新工作，立即将 tracker 设为 `PAUSED`，重新规划并请求批准。

### S-01：整理证据与失败时间线

- [x] T-01 | A-01 | 读取并登记当前 Live2D 资产、ART_SPEC、ASSET_MANIFEST、LAYER_MAP | output: 输入资产索引 | acceptance: 每个纳入依据的文件、用途和只读/可写边界均已记录
- [x] T-02 | A-01 | 对照历史 PLAN/TASK 与用户最终验收，建立有效规则与废弃路线表 | output: 规则账本 | acceptance: 完整非空底图、局部蒙版、独立半态、默认层 0%、无缝验收被标为有效；挖空底图、交叉淡化、重复层名、错误编码、错误绑定被标为失败路线

### S-02：定义跨人物输入与美术契约

- [x] T-03 | A-02 | 编写输入、原图保护、尺寸/色彩、ROI 和局部 donor 契约 | output: `input-and-art-contract.md` 初稿 | acceptance: 可区分原图、工作副本、donor、最终层，且全脸非空底图为硬约束
- [x] T-04 | A-02 | 将蒙版外像素为零差异、独立半态素材、停止条件和人物参数化写入契约 | output: 完整美术契约 | acceptance: 契约能指导不同尺寸输入，不把当前人物的坐标或文件名硬编码

### S-03：固化 PSD 与 Cubism 接口

- [x] T-05 | A-03 | 根据成功十层结构编写 PSD 图层、Alpha、色彩空间和命名接口 | output: `psd-layer-contract.md` | acceptance: 明确 `static_locked_base` 全脸非空、十层名称、全画布要求和禁止重复命名
- [x] T-06 | A-03 | 编写参数/透明度/绘制顺序、组合独立性和关闭重开模板 | output: Cubism 速查表 | acceptance: 包含嘴/左右眼三参数的 0/0.5/1 覆盖规则、绘制顺序、默认状态、检查点和失败回退

### S-04：编写技能入口与路由

- [x] T-07 | A-04 | 初始化仓库级技能目录与入口文件 | output: `SKILL.md`、`agents/openai.yaml` | acceptance: frontmatter 合法，描述只触发人像 Live2D 分层/建模任务，明确不含前端运行时和发布
- [x] T-08 | A-04 | 在入口中加入阶段路由、停止条件和参考文件读取规则 | output: 可发现的技能入口 | acceptance: 入口能按输入准备、PSD、Cubism、验收阶段路由到对应参考，不加载无关资料

### S-05：编写详细流程与故障手册

- [x] T-09 | A-05 | 编写 PSD/底图设计参考 | output: `references/psd-design.md` | acceptance: 覆盖完整非空底图、局部编辑边界、donor、Alpha、编码和导入前检查
- [x] T-10 | A-05 | 编写 Cubism 手工建模参考 | output: `references/cubism-rigging.md` | acceptance: 覆盖参数、节点、绘制顺序、错误绑定检查、逐区验收、检查点另存和重开
- [x] T-11 | A-05 | 编写失败与恢复参考 | output: `references/pitfalls-and-recovery.md` | acceptance: 历史五类以上故障均有症状、首查对象、停止点和回退路径

### S-06：增加检查脚本与故障夹具

- [x] T-12 | A-06 | 编写输入图与蒙版/像素差异检查 | output: `audit_portrait_assets.py` | acceptance: 能检查尺寸、色彩、全脸底图非空、蒙版外差异和源图只读约束
- [x] T-13 | A-06 | 编写图层/状态清单和联系表生成器 | output: `build_state_contact_sheet.py` 或等价工具 | acceptance: 能报告重复图层名、状态覆盖表和组合联系表；输出不修改源资产
- [x] T-14 | A-06 | 构造成功样本和至少四类受控坏样本 | output: 测试夹具与预期结果 | acceptance: 成功样本通过；挖空底图、重复层名、错误 Alpha、蒙版外改动等坏样本各自明确失败

### S-07：完成结构校验与回归走读

- [x] T-15 | A-07 | 运行技能包结构与元数据快速校验 | output: `quick_validate.py` 报告 | acceptance: frontmatter、命名、引用路径和无占位脚手架均通过
- [x] T-16 | A-07 | 用当前成功模型和受控第二输入完成回归走读 | output: 回归记录 | acceptance: 核心规则无需改写，人物差异只出现在输入参数/样例；当前模型不回归
- [x] T-17 | A-07 | 用故障夹具验证前置拦截和失败回退 | output: 故障测试报告 | acceptance: 至少四类历史错误在进入 Cubism 前被阻断，且报告给出下一步回退位置
- [x] T-18 | A-07 | 复盘技能边界与未纳入项 | output: 最终使用边界 | acceptance: 明确不含前端、运行时导出、自动 GUI、发布和商业许可；所有 approved action 有完成证据

## 发现与变更记录

- 2026-09-01 | 用户批准 `PT-live2d-portrait-skill` v1，并明确“底图一律用全脸非空底图”。
- 2026-09-01 | 批准方案通过 `validate-plan.py --print-digest`，摘要为 `sha256:9a8f0f77f7fcbf088784c33350628e105791e577171ce768b8d5cf1f6770209a`。
- 2026-09-01 | 初始 tracker 创建；所有 T-* 尚未验收，执行从 A-01 开始。
- 2026-09-01 | A-01/T-01/T-02 已验收；新增技能参考 `references/rule-registry.md`，明确有效规则、废弃路线、当前人物样例和未知项。后续正文不得绕过该登记表直接引用历史流程。
- 2026-09-01 | A-02/T-03/T-04 已验收；新增 `references/input-and-art-contract.md`，把全脸非空底图、原图保护、局部 donor、独立半态、蒙版外零差异和停止条件固化为跨人物输入闸门。
- 2026-09-01 | A-03/T-05/T-06 已验收；新增 `references/psd-layer-contract.md`，固化十层全画布结构、全脸非空底图、累积覆盖表、参数绑定、导入闸门和重开验收。
- 2026-09-01 | A-04/T-07/T-08 已验收；完成技能入口草稿和 UI 元数据，明确阶段路由、全脸非空底图硬约束、人工 Cubism 交接和前端范围边界。
- 2026-09-01 | A-05/T-09/T-10/T-11 已验收；新增 PSD 设计、Cubism 操作和故障恢复参考，覆盖从导入前闸门到最终 `.cmo3` 重开验收的完整人工流程。
- 2026-09-01 | A-06/T-12/T-13/T-14 已验收；新增 PNG/Alpha/manifest/diff 审计、联系表生成器和自测夹具。当前真实十层样例通过，四类受控错误均按预期失败。
- 2026-09-01 | A-07/T-15/T-16/T-17/T-18 已验收；目标技能 quick_validate 通过，self-test 在 32×32 与 48×40 参数化输入通过，当前真实十层样例审计通过，技能边界明确不含前端、运行时、自动 GUI、发布和商业许可。

## 完成标准

- A-01 | evidence: `references/rule-registry.md` records source priority, valid invariants, retired routes, character-specific samples, unknowns, and assumptions.
- A-02 | evidence: `references/input-and-art-contract.md` defines immutable source handling, parameterized dimensions/ROIs, local donor boundaries, mask-outside zero-diff, independent half states, and stop conditions.
- A-03 | evidence: `references/psd-layer-contract.md` defines the full-face non-empty opaque base, ten-layer canvas/name/Alpha contract, draw-order and parameter coverage, import gates, and reopen checks.
- A-04 | evidence: `.agents/skills/live2d-portrait-rigging/SKILL.md` and `agents/openai.yaml` provide the reusable entrypoint, routing boundaries, implicit trigger metadata, and explicit exclusion of frontend/runtime/publishing.
- A-05 | evidence: `references/psd-design.md`, `references/cubism-rigging.md`, and `references/pitfalls-and-recovery.md` cover the staged workflow, manual Cubism handoff, checkpoints, failure signals, and recovery paths.
- A-06 | evidence: `scripts/audit_portrait_assets.py`, `scripts/build_state_contact_sheet.py`, and `scripts/self_test.py` provide deterministic audits, contact-sheet generation, and positive/four-negative controlled fixtures; current 636x821 ten-layer assets pass.
- A-07 | evidence: target `quick_validate.py`, parameterized self-tests (32x32 and 48x40), current asset audit, and the final reopen-confirmed model walkthrough all pass; the skill boundary excludes frontend, runtime export, GUI automation, publishing, and licensing.

- 技能包结构、frontmatter、元数据、引用路径和脚本通过相应验证器。
- 技能只推荐全脸非空底图；原图保护、局部蒙版、独立半态、PSD 层接口、Cubism 参数和重开验收均有可执行说明。
- 当前成功模型通过正向回归；至少四类历史故障由脚本或前置闸门阻断并给出回退路径。
- 技能在不同参数化输入上可走读，且不把人物特定坐标、文件名和临时数值误当通用规则。
- 所有已批准 A-01 至 A-07 均有完成证据；未进入前端、发布、提交或未批准的外部操作。
