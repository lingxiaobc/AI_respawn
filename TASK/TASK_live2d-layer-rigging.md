---
task_schema: plan-tasks-tracker/v2
plan_schema: rumelt-task-plan/v2
plan_id: PT-live2d-layer-rigging
plan_version: 2
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05,S-06
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06,A-07
approved_plan_digest: sha256:b4c6e18131815e74acc4222a7f1754b0d405a790187260d5b8bb81176a7e6633
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-04,M-05,M-06,M-07,M-08
execution_status: IN_PROGRESS
created_at: 2026-08-31
updated_at: 2026-09-01
---

# TASK：Live2D 完整底图分层驱动重建

## 任务目标与批准快照

- 目标：在当前完整全脸底图模型上完成嘴、左眼、右眼的连续独立驱动，保存可重开的最终 `.cmo3`。
- 主要诊断：旧文档仍把挖空底图和默认局部层常驻 `100%` 当作执行规则；这与已验证的完整底图架构冲突，会重新引入重复覆盖和椭圆接缝。
- 指导方针：`static_locked_base` 永久 `100%` 提供闭嘴和双眼睁开的默认像素；`mouth_closed_local`、`eye_L_open_local`、`eye_R_open_local` 三个默认状态局部层在所有节点保持 `0%`，半态与终态层累积渐进覆盖。
- 近端目标：获得可关闭重开的 `portrait_cubism_final.cmo3`，三个参数在 `0/0.3/0.5/0.8/1`、动态往返和组合状态下均无棋盘格、椭圆白边、透明洞、明显双影、突然换皮或参数联动。
- 主动不做：不修改网格、变形器、位置、尺寸、颜色、蒙版、剪贴或参数范围；不覆盖旧文件；不进入导出、Web SDK、音频驱动、自动眨眼代码、Git 提交或发布。
- 批准依据：用户审阅 `PT-live2d-layer-rigging v2` 摘要和完整底图累积覆盖表后明确回复“批准并执行”。
- 路由快照：不确定性中等；强串行依赖；可逆性混合；范围限于一份 PSD、一份工作模型和两份 TASK 文档；旧方案惯性显著；环境稳定；用户操作与助手验收串行交接。
- 已选模块：M-01,M-02,M-03,M-04,M-05,M-06,M-07,M-08。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02,A-03; S-03 -> A-04; S-04 -> A-05; S-05 -> A-06; S-06 -> A-07

## 变更范围

- 涉及模块或目录：`AI_output/live2d/model/portrait_cubism_fullbase.psd`、当前工作 `.cmo3`、后续三个新 `.cmo3` 检查点、`TASK/PLAN_live2d-layer-rigging.md`、`TASK/TASK_live2d-layer-rigging.md`。
- 预计影响文件数：两份 TASK 文档被重写；用户后续另存三个新的 `.cmo3`；PSD 和旧模型只读保留。
- 允许的工具与权限：用户手动操作 Cubism、另存、关闭和重开；助手读取截图与工作区证据、维护 TODO、运行本地 PLAN/TASK 验证器。
- 禁止或需另行批准：改变 PSD 图层内容/结构、修改网格或变形器、覆盖旧 PSD/模型、控制用户 GUI、模型导出、代码集成、提交或发布。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 已验证 PSD/模型事实、旧 PLAN/TODO、用户批准的 v2 摘要 | 绑定同一摘要与行动契约的 `PLAN_live2d-layer-rigging.md` 和 `TASK_live2d-layer-rigging.md` | none | 助手可写 `TASK/` 并运行本地只读验证器 | 两份文档通过 v2 验证，速查表、未完成任务和完成标准均只采用完整底图规则，历史误判仅位于变更记录 | 验证失败则停止模型操作，修正文档结构、映射或摘要绑定后重新验证 |
| A-02 | 已通过五个定点的当前工作模型 | 嘴参数 `0→1→0` 动态验收记录 | A-01 | 用户操作 Cubism；助手读取用户确认或截图 | 全程连续，无跳变、棋盘格、椭圆白边、透明洞、明显双影或瞬时换皮 | 任一异常即停在当前参数值，记录方向和值域，只回查三个嘴层的透明度、绘制顺序与 PSD Alpha，不进入眼部 |
| A-03 | 通过动态验收的工作模型 | 可重新打开的 `portrait_mouth_pass.cmo3` | A-02 | 用户在 Cubism 另存、关闭并重开 | 文件名正确，重开后默认闭嘴且嘴参数五个定点与动态行为不丢失 | 保存或重开异常则保留当前工作模型，停止眼部设置并回到 A-02 的已通过状态排查文件与保存路径 |
| A-04 | 嘴部检查点、左眼三个局部层、`ParamEyeLOpen` | 左眼节点表、五个定点与动态独立性验收记录 | A-03 | 用户逐图层逐节点操作 Cubism；助手逐项验收截图 | `eye_L_open_local=[0,0,0]`、`eye_L_half_local=[100,100,0]`、`eye_L_closed_local=[100,0,0]`，绘制顺序 `500/510/520`；`0/0.3/0.5/0.8/1` 与往返拖动无接缝且仅左眼变化 | 任一节点或视觉检查失败即停止，不迁移右眼；回到当前左眼图层的数值、绘制顺序或 PSD Alpha，若默认层归零原则被证伪则暂停并重新规划 |
| A-05 | 已通过的左眼规则、右眼三个局部层、`ParamEyeROpen` | 右眼节点表、五个定点与动态独立性验收记录，以及双眼检查点 `portrait_eyes_pass.cmo3` | A-04 | 用户逐图层逐节点操作 Cubism并另存；助手逐项验收截图 | `eye_R_open_local=[0,0,0]`、`eye_R_half_local=[100,100,0]`、`eye_R_closed_local=[100,0,0]`，绘制顺序 `500/510/520`；五定点和往返拖动无接缝且仅右眼变化；检查点可重新打开 | 任一异常即停止并保留左眼检查点，只回退右眼设置；若左右眼素材表现不同则记录差异并暂停迁移假设 |
| A-06 | 嘴和双眼均已通过的检查点 | 极端组合、中间组合和单参数拖动的综合验收记录 | A-05 | 用户操作三个参数；助手读取截图与明确确认 | 默认、半态、终态及 `嘴0.8/左眼0.3/右眼0.3` 均无接缝；分别拖动时只改变对应区域，三个参数可同时呈现 | 出现联动则停止最终保存，检查错误参数绑定；出现局部接缝则只回到对应 A-02、A-04 或 A-05，不整体推倒重做 |
| A-07 | 通过组合验收的模型 | `portrait_cubism_final.cmo3` 与重开复验记录 | A-06 | 用户在 Cubism 另存、关闭并重开；助手记录验收 | 不覆盖旧检查点；重开后默认嘴0、左眼1、右眼1，三参数节点、动态行为和独立性均保持 | 保存失败则保留双眼检查点；重开后设置丢失则不导出，回到 A-06 前的模型核对保存对象与 PSD 关联 |

## 任务明细

### 执行规则

- 一次只执行第一个未勾选任务；未达到 acceptance 时不进入下一项。
- 节点修改前确认：图层、参数、节点值、绘制顺序、不透明度。
- 视觉检查前取消对象选择并把鼠标移出画布，避免把选框或工具轮廓误判为白边。
- 任意异常立即停止；只回查当前区域，不批量选择、不全盘重做。

### 唯一有效速查表

| 图层 | 参数 | 绘制顺序 | 0 | 0.5 | 1 |
| --- | --- | ---: | ---: | ---: | ---: |
| `static_locked_base` | 无 | 400 | 100% | 100% | 100% |
| `mouth_closed_local` | `ParamMouthOpenY` | 500 | 0% | 0% | 0% |
| `mouth_half_local` | `ParamMouthOpenY` | 510 | 0% | 100% | 100% |
| `mouth_open_local` | `ParamMouthOpenY` | 520 | 0% | 0% | 100% |
| `eye_L_open_local` | `ParamEyeLOpen` | 500 | 0% | 0% | 0% |
| `eye_L_half_local` | `ParamEyeLOpen` | 510 | 100% | 100% | 0% |
| `eye_L_closed_local` | `ParamEyeLOpen` | 520 | 100% | 0% | 0% |
| `eye_R_open_local` | `ParamEyeROpen` | 500 | 0% | 0% | 0% |
| `eye_R_half_local` | `ParamEyeROpen` | 510 | 100% | 100% | 0% |
| `eye_R_closed_local` | `ParamEyeROpen` | 520 | 100% | 0% | 0% |

### S-01：固化基线并绑定文档

- [x] T-01 | A-01 | 核对 `portrait_cubism_fullbase.psd`、当前工作模型和嘴部五定点的已验证事实 | output: v2 事实基线 | acceptance: PLAN 中仅把直接检查或用户截图确认的内容列为事实，眼部与组合保留为未知
- [x] T-02 | A-01 | 重写并验证 `PLAN_live2d-layer-rigging.md` v2 | output: 规范化批准方案与 SHA-256 摘要 | acceptance: `validate-plan.py --print-digest` 返回 0 error、0 warning，并生成 tracker 使用的摘要
- [x] T-03 | A-01 | 重写并验证 `TASK_live2d-layer-rigging.md` v2 | output: 与批准 PLAN 精确绑定的新 TODO | acceptance: `validate-task-tracker.py --plan` 返回 0 error、0 warning，且未完成任务只采用完整底图规则

### S-02：完成嘴部动态与检查点

- [x] T-04 | A-02 | 保留嘴参数 `0/0.3/0.5/0.8/1` 的新架构定点验收 | output: 五个定点截图证据 | acceptance: 五个值均已在取消选择后确认无棋盘格、椭圆白边、透明洞或明显双影
- [ ] T-05 | A-02 | 缓慢往返拖动嘴参数 `0→1→0` | output: 嘴部动态连续性确认 | acceptance: 全程无跳变、棋盘格、椭圆白边、透明洞、明显双影或瞬时换皮
- [ ] T-06 | A-03 | 将通过动态验收的模型另存为 `portrait_mouth_pass.cmo3` | output: 嘴部检查点文件 | acceptance: 使用新文件名保存成功且标题栏文件名正确
- [ ] T-07 | A-03 | 关闭并重新打开 `portrait_mouth_pass.cmo3`，复测嘴参数 | output: 嘴部检查点重开记录 | acceptance: 默认闭嘴，五个定点与动态行为均保持

### S-03：设置并验收左眼

- [ ] T-08 | A-04 | 确认 `左眼 开闭/ParamEyeLOpen` 范围 `0～1`、默认值 `1` | output: 左眼参数基线 | acceptance: 参数名称、范围和默认值正确
- [ ] T-09 | A-04 | 确认 `eye_L_open_local` 混合正常、Alpha Blend=Over、无剪贴/反转蒙版 | output: 左眼睁眼层属性记录 | acceptance: 四项属性正确且未修改网格、位置、尺寸或颜色
- [ ] T-10 | A-04 | 确认 `eye_L_half_local` 混合正常、Alpha Blend=Over、无剪贴/反转蒙版 | output: 左眼半闭层属性记录 | acceptance: 四项属性正确且未修改其他属性
- [ ] T-11 | A-04 | 确认 `eye_L_closed_local` 混合正常、Alpha Blend=Over、无剪贴/反转蒙版 | output: 左眼闭眼层属性记录 | acceptance: 四项属性正确且未修改其他属性
- [ ] T-12 | A-04 | 设置 `eye_L_open_local @ 0` 为绘制顺序 `500`、不透明度 `0%` | output: 左睁眼层节点 0 | acceptance: 三关键点存在且当前两个数值正确
- [ ] T-13 | A-04 | 设置 `eye_L_open_local @ 0.5` 为绘制顺序 `500`、不透明度 `0%` | output: 左睁眼层节点 0.5 | acceptance: 当前两个数值正确
- [ ] T-14 | A-04 | 设置 `eye_L_open_local @ 1` 为绘制顺序 `500`、不透明度 `0%` | output: 左睁眼层节点 1 | acceptance: 当前两个数值正确，默认睁眼只来自完整底图
- [ ] T-15 | A-04 | 设置 `eye_L_half_local @ 0` 为绘制顺序 `510`、不透明度 `100%` | output: 左半闭层节点 0 | acceptance: 三关键点存在且当前两个数值正确
- [ ] T-16 | A-04 | 设置 `eye_L_half_local @ 0.5` 为绘制顺序 `510`、不透明度 `100%` | output: 左半闭层节点 0.5 | acceptance: 当前两个数值正确
- [ ] T-17 | A-04 | 设置 `eye_L_half_local @ 1` 为绘制顺序 `510`、不透明度 `0%` | output: 左半闭层节点 1 | acceptance: 当前两个数值正确
- [ ] T-18 | A-04 | 设置 `eye_L_closed_local @ 0` 为绘制顺序 `520`、不透明度 `100%` | output: 左闭眼层节点 0 | acceptance: 三关键点存在且当前两个数值正确
- [ ] T-19 | A-04 | 设置 `eye_L_closed_local @ 0.5` 为绘制顺序 `520`、不透明度 `0%` | output: 左闭眼层节点 0.5 | acceptance: 当前两个数值正确
- [ ] T-20 | A-04 | 设置 `eye_L_closed_local @ 1` 为绘制顺序 `520`、不透明度 `0%` | output: 左闭眼层节点 1 | acceptance: 当前两个数值正确
- [ ] T-21 | A-04 | 取消选择后检查左眼参数 `0` | output: 左眼闭合画面 | acceptance: 闭眼自然，无棋盘格、椭圆白边、透明洞或明显双影
- [ ] T-22 | A-04 | 取消选择后检查左眼参数 `0.3` | output: 左眼闭到半闭过渡画面 | acceptance: 连续自然，无漏底、闪变或双影
- [ ] T-23 | A-04 | 取消选择后检查左眼参数 `0.5` | output: 左眼半闭画面 | acceptance: 半闭状态完整且无接缝
- [ ] T-24 | A-04 | 取消选择后检查左眼参数 `0.8` | output: 左眼半闭到睁眼过渡画面 | acceptance: 连续自然，无漏底、闪变或双影
- [ ] T-25 | A-04 | 取消选择后检查左眼参数 `1` | output: 左眼默认睁眼画面 | acceptance: 与完整底图原始睁眼一致，无重复贴片接缝
- [ ] T-26 | A-04 | 缓慢往返拖动左眼参数 `0→1→0` | output: 左眼动态独立性记录 | acceptance: 全程无接缝且只有左眼变化，嘴和右眼不动

### S-04：设置并验收右眼

- [ ] T-27 | A-05 | 确认 `右眼 开闭/ParamEyeROpen` 范围 `0～1`、默认值 `1` | output: 右眼参数基线 | acceptance: 参数名称、范围和默认值正确
- [ ] T-28 | A-05 | 确认 `eye_R_open_local` 混合正常、Alpha Blend=Over、无剪贴/反转蒙版 | output: 右眼睁眼层属性记录 | acceptance: 四项属性正确且未修改网格、位置、尺寸或颜色
- [ ] T-29 | A-05 | 确认 `eye_R_half_local` 混合正常、Alpha Blend=Over、无剪贴/反转蒙版 | output: 右眼半闭层属性记录 | acceptance: 四项属性正确且未修改其他属性
- [ ] T-30 | A-05 | 确认 `eye_R_closed_local` 混合正常、Alpha Blend=Over、无剪贴/反转蒙版 | output: 右眼闭眼层属性记录 | acceptance: 四项属性正确且未修改其他属性
- [ ] T-31 | A-05 | 设置 `eye_R_open_local @ 0` 为绘制顺序 `500`、不透明度 `0%` | output: 右睁眼层节点 0 | acceptance: 三关键点存在且当前两个数值正确
- [ ] T-32 | A-05 | 设置 `eye_R_open_local @ 0.5` 为绘制顺序 `500`、不透明度 `0%` | output: 右睁眼层节点 0.5 | acceptance: 当前两个数值正确
- [ ] T-33 | A-05 | 设置 `eye_R_open_local @ 1` 为绘制顺序 `500`、不透明度 `0%` | output: 右睁眼层节点 1 | acceptance: 当前两个数值正确，默认睁眼只来自完整底图
- [ ] T-34 | A-05 | 设置 `eye_R_half_local @ 0` 为绘制顺序 `510`、不透明度 `100%` | output: 右半闭层节点 0 | acceptance: 三关键点存在且当前两个数值正确
- [ ] T-35 | A-05 | 设置 `eye_R_half_local @ 0.5` 为绘制顺序 `510`、不透明度 `100%` | output: 右半闭层节点 0.5 | acceptance: 当前两个数值正确
- [ ] T-36 | A-05 | 设置 `eye_R_half_local @ 1` 为绘制顺序 `510`、不透明度 `0%` | output: 右半闭层节点 1 | acceptance: 当前两个数值正确
- [ ] T-37 | A-05 | 设置 `eye_R_closed_local @ 0` 为绘制顺序 `520`、不透明度 `100%` | output: 右闭眼层节点 0 | acceptance: 三关键点存在且当前两个数值正确
- [ ] T-38 | A-05 | 设置 `eye_R_closed_local @ 0.5` 为绘制顺序 `520`、不透明度 `0%` | output: 右闭眼层节点 0.5 | acceptance: 当前两个数值正确
- [ ] T-39 | A-05 | 设置 `eye_R_closed_local @ 1` 为绘制顺序 `520`、不透明度 `0%` | output: 右闭眼层节点 1 | acceptance: 当前两个数值正确
- [ ] T-40 | A-05 | 取消选择后检查右眼参数 `0` | output: 右眼闭合画面 | acceptance: 闭眼自然，无棋盘格、椭圆白边、透明洞或明显双影
- [ ] T-41 | A-05 | 取消选择后检查右眼参数 `0.3` | output: 右眼闭到半闭过渡画面 | acceptance: 连续自然，无漏底、闪变或双影
- [ ] T-42 | A-05 | 取消选择后检查右眼参数 `0.5` | output: 右眼半闭画面 | acceptance: 半闭状态完整且无接缝
- [ ] T-43 | A-05 | 取消选择后检查右眼参数 `0.8` | output: 右眼半闭到睁眼过渡画面 | acceptance: 连续自然，无漏底、闪变或双影
- [ ] T-44 | A-05 | 取消选择后检查右眼参数 `1` | output: 右眼默认睁眼画面 | acceptance: 与完整底图原始睁眼一致，无重复贴片接缝
- [ ] T-45 | A-05 | 缓慢往返拖动右眼参数 `0→1→0` | output: 右眼动态独立性记录 | acceptance: 全程无接缝且只有右眼变化，嘴和左眼不动
- [ ] T-46 | A-05 | 另存并重新打开 `portrait_eyes_pass.cmo3` | output: 双眼检查点重开记录 | acceptance: 文件名正确，双眼节点、默认值和动态行为均保持

### S-05：组合与独立性验收

- [ ] T-47 | A-06 | 验收组合 `嘴0、左眼1、右眼1` | output: 默认中性画面 | acceptance: 闭嘴睁眼与完整底图一致，无局部贴片接缝
- [ ] T-48 | A-06 | 验收组合 `嘴0.5、左眼1、右眼1` | output: 半张嘴睁眼画面 | acceptance: 嘴部完整且双眼不变
- [ ] T-49 | A-06 | 验收组合 `嘴1、左眼1、右眼1` | output: 全张嘴睁眼画面 | acceptance: 嘴内完整且双眼不变
- [ ] T-50 | A-06 | 验收组合 `嘴0、左眼0、右眼0` | output: 闭嘴闭眼画面 | acceptance: 双眼自然闭合且嘴不变
- [ ] T-51 | A-06 | 验收组合 `嘴0.5、左眼0.5、右眼0.5` | output: 三参数半态画面 | acceptance: 三个区域完整且无接缝、空洞或双影
- [ ] T-52 | A-06 | 验收组合 `嘴1、左眼0、右眼0` | output: 张嘴闭眼画面 | acceptance: 说话与眨眼可同时呈现且互不污染
- [ ] T-53 | A-06 | 验收组合 `嘴0.8、左眼0.3、右眼0.3` | output: 三参数中间插值画面 | acceptance: 无棋盘格、椭圆白边、透明洞、明显双影或突然换皮
- [ ] T-54 | A-06 | 分别单独拖动嘴、左眼、右眼参数 | output: 参数独立性确认 | acceptance: 每个参数只改变对应区域，其他两个区域不动

### S-06：最终保存与重开

- [ ] T-55 | A-07 | 将组合验收通过的模型另存为 `portrait_cubism_final.cmo3` | output: 最终 Cubism 源模型 | acceptance: 新文件保存成功且未覆盖 PSD、工作模型或两个检查点
- [ ] T-56 | A-07 | 关闭并重新打开 `portrait_cubism_final.cmo3` | output: 最终模型重开记录 | acceptance: 标题栏文件名正确，默认嘴0、左眼1、右眼1
- [ ] T-57 | A-07 | 重开后复测三参数五定点、动态往返和独立性 | output: 最终持久性验收记录 | acceptance: 所有节点、动态行为和组合独立性均保持，无设置丢失

## 发现与变更记录

- 2026-08-31 | 初始方案误把挖空底图视为必要结构，并让闭嘴/睁眼默认局部层常驻 `100%`；该规则后来产生棋盘格和椭圆白边，旧执行方案作废。
- 2026-09-01 | `static_locked_base` 已替换为完整全脸原图；直接检查 `portrait_cubism_fullbase.psd` 确认十层顺序完整，底图全不透明且坐标、尺寸正确。
- 2026-09-01 | Cubism 已将修正 PSD 替换导入当前备份模型；隐藏 `mouth_closed_local` 后闭嘴仍完整，证明默认画面由全脸底图承担。
- 2026-09-01 | 嘴部默认层三个节点全部重设为 `0%`；嘴参数 `0/0.3/0.5/0.8/1` 已重新通过截图验收，无棋盘格、椭圆白边、透明洞或明显双影。
- 2026-09-01 | 用户批准 `PT-live2d-layer-rigging v2` 全部六个步骤与累积覆盖表；PLAN 已通过规范验证并取得摘要 `sha256:b4c6e18131815e74acc4222a7f1754b0d405a790187260d5b8bb81176a7e6633`。
- 2026-09-01 | 旧 T-01 至 T-80 清单被本 v2 清单整体替换；旧误判仅保留为复盘证据，不再作为未完成任务的操作依据。
- 2026-09-01 | 新 tracker 与批准 PLAN 的摘要、步骤映射、行动接口和任务覆盖通过 `validate-task-tracker.py --plan` 校验，0 error、0 warning；T-03 已验收。A-01 闸门通过后，依据本轮已提供的五张新架构截图恢复嘴部五定点 T-04 的完成状态。

## 完成标准

- PLAN 与 tracker 通过 v2 验证，摘要、批准范围、步骤映射和七个行动接口精确一致。
- `static_locked_base` 保持绘制顺序 400、不透明度 100%、不绑定嘴眼参数；三个默认状态局部层全部节点保持 0%。
- 嘴、左眼、右眼分别通过 `0/0.3/0.5/0.8/1`、动态往返和独立性验收，无棋盘格、椭圆白边、透明洞、明显双影或突然换皮。
- 三参数极端与中间组合均自然，分别拖动时只改变对应区域。
- `portrait_mouth_pass.cmo3`、`portrait_eyes_pass.cmo3` 和 `portrait_cubism_final.cmo3` 均使用新文件名保存；最终模型关闭重开后设置不丢失。
- 完成前不进入模型导出、Web SDK、音频驱动或自动眨眼代码。
