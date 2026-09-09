---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: avatar-manage-normalize
plan_id: PT-avatar-manage-normalize
plan_version: 3
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05
approved_scope: A-01,A-02,A-03,A-04,A-05
approved_plan_digest: sha256:666ca6ab2a6547719bdb4eb0f028775c5511c36e439c1a0e921a251de29585ee
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-07,M-08,M-09
execution_status: COMPLETED
created_at: 2026-09-09
updated_at: 2026-09-09
---
# 角色管理与照片标准化
## 任务目标与批准快照
- 目标：角色管理、全自动照片标准化和接听入口。
- 主要诊断：新生命周期需持久化并与通话抢占一致。
- 指导方针：小样验证保真；标准图检查点；软删除；主失败回退一次；接听才建立通话。
- 近端目标：两组修正后的近远景样例、重启保留状态、自动制作和通话回归通过。
- 主动不做：物理清理、恢复界面、账号、摄像头、声音克隆、旧角色重做。
- 批准依据：用户2026-09-09批准v2全步骤，随后批准v3全部经AI的提示词修正、追加最多4次验证，且已确认新图可以继续。
- 路由快照：full / auto / 高风险 / 混合可逆。
- 已选模块：M-01,M-02,M-03,M-07,M-08,M-09。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04; S-05 -> A-05
## 变更范围
- 涉及模块或目录：apps/server/src、apps/web/src、packages/avatar、scripts、docs及PRD。
- 预计影响文件数：15至25文件。
- 允许的工具与权限：本地代码修改、测试、服务启动、浏览器验证；原批准6次真实生图及v3追加4次（均已用完）、本地响应重放及现有语音调用。
- 禁止或需另行批准：不提交推送、不输出密匙、不动用户源照片、不新增模型或扩大生图调用次数。
## 行动执行契约
| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 修正后的保真/表情提示、1近景1远景、服务端配置 | 两组近远景对比、接口/耗时/用量证据 | none | 用户追加批准本轮最多4次真实调用，青年近景和老人-女2-远各主一次、失败回退一次；不自动额外重抽 | 接口可用、近景保留原有笑容和五官皱纹，远景适当调整占比但保留本人及背景，无证件照化，用户可检查相似性 | 停止扩批；错误区分权限/参数/质量，超原范围重抽先修订 |
| A-02 | 现有SQLite及F-06 | 软删除字段迁移、API、菜单和persona表单 | none | 批准后代码修改，软删除不物理清理 | 重启保存名称设定，归档仍在DB但列表/调用/队列排除，处理中删除安全，原图及成品保留 | 保留旧数据迁移可回退，复活或误清理则停止发布 |
| A-03 | A-01结果及A-02存储 | 原图编辑双协议适配、标准图检查点和自动制作 | A-01,A-02 | 批准后每图主请求一次失败回退一次，密匙不出服务端 | 三张独立失败继续，主失败回退成功自动制作，两者失败提示可手动重试；成功图复用；通话/归档中断不触发回退 | 超时或无可用图回退一次，回退失败终止该图；在途结果保存但不重激活归档，不降级为未标准化原图 |
| A-04 | 现有CallRoom、角色持久化 | 等待页面绿色接听、服务端persona快照 | A-02 | 批准后修改通话状态机 | 接听前无麦克风请求/WS/通话计时/算力占用，双击只一会话；接听后音声嘴型照旧，后续新通话采用修改设定 | 生命周期回归失败则停发布，保留已有渲染/语音实现定位新状态 |
| A-05 | 前四项实现、既有测试和样例产物 | 测试记录、PRD及说明同步 | A-01,A-02,A-03,A-04 | 批准后本地验证、沿用配置真实语音；媒体样例生成次数受A-01限制 | 批量、删除竞态、重命名、persona隔离、接听前零权限、取消/挂断/重进均通过，构建类型测试通过 | 失败定位对应阶段修复，主体保真需人工判定不得以自动通过替代 |
## 任务明细
- [x] T-01 | A-01 | 验证修正后的近远景照片编辑 | output: 两组近远景对比、接口/耗时/用量证据 | acceptance: 接口可用、近景保留原有笑容和五官皱纹，远景适当调整占比但保留本人及背景，无证件照化，用户可检查相似性
- [x] T-02 | A-02 | 实现角色管理持久化 | output: 软删除字段迁移、API、菜单和persona表单 | acceptance: 重启保存名称设定，归档仍在DB但列表/调用/队列排除，处理中删除安全，原图及成品保留
- [x] T-03 | A-03 | 接入持久化标准化和单次回退 | output: 原图编辑双协议适配、标准图检查点和自动制作 | acceptance: 三张独立失败继续，主失败回退成功自动制作，两者失败提示可手动重试；成功图复用；通话/归档中断不触发回退
- [x] T-04 | A-04 | 增加等待接听并接入persona | output: 等待页面绿色接听、服务端persona快照 | acceptance: 接听前无麦克风请求/WS/通话计时/算力占用，双击只一会话；接听后音声嘴型照旧，后续新通话采用修改设定
- [x] T-05 | A-05 | 完成故障与端到端验收 | output: 测试记录、PRD及说明同步 | acceptance: 批量、删除竞态、重命名、persona隔离、接听前零权限、取消/挂断/重进均通过，构建类型测试通过
## 发现与变更记录
- 2026-09-09 | T-03 | evidence: type=test; locator=npm test 与 artifacts/role-flow/1788966970593/verification.json; result=62/62通过；真实本地三张批次两成功一失败，148ms让出资源，挂断恢复；校验故障分类实测通过且没有追加云请求。
- 2026-09-09 | T-04 | evidence: type=artifact; locator=artifacts/role-flow/1788966970593/browser-verification.json; result=等待页无iframe计时和活动会话；接听后聆听并挂断释放；名称点号保留、设定保存重读、等待返回通过；实际网关测试证实不同角色设定隔离。
- 2026-09-09 | T-05 | evidence: type=command; locator=npm test; npm run build; npm run avatar:verify; git diff --check; result=62项测试、类型检查构建、12项资源校验及差异检查通过；两位新版角色各三轮真实豆包音频和嘴部播放通过；审查发现的名称及校验分类问题已修复。
- 2026-09-09 | A-01 | evidence: type=manual; locator=用户2026-09-09新图验收及artifacts/portrait-verification-v3/requests.json; result=青年近景与老人女远景已获用户认可；4次请求已用完，主模型两次500，回退两次成功。
- 2026-09-09 | A-02 | evidence: type=test; locator=packages/avatar/management.test.ts 与 packages/avatar/store.test.ts; result=字段持久化、软删除保留资源并隔离读取通话、重启及旧写入不复活均通过。
- 2026-09-09 | A-03 | evidence: type=artifact; locator=artifacts/role-flow/1788966970593/verification.json; result=响应重放与实际本地制作打通，批内独立失败，成功图复用，实时通话抢占和恢复通过；全套测试验证回退及重启检查点。
- 2026-09-09 | A-04 | evidence: type=artifact; locator=artifacts/role-flow/1788966970593/browser-verification.json; result=绿色接听前零活动会话、接听后麦克风就绪，挂断和等待返回均释放；新角色各三轮豆包语音收到且嘴部发生变化。
- 2026-09-09 | A-05 | evidence: type=file; locator=docs/ROLE_MANAGEMENT_NORMALIZATION.md; result=实现规则、主模型500的限制、测试62/62及浏览器验收已同步文档和两份PRD。
- 2026-09-09 | overall | evidence: type=artifact; locator=artifacts/role-flow/1788966970593/browser-verification.json; result=用户认可的新图已制作为两位可通话角色；62项测试及构建通过；原角色保留；最终服务重启成功；已披露主模型故障及固定音频测试不替代长期主观同步验收。
- 2026-09-09 | T-01 | evidence: type=manual; locator=用户2026-09-09对青年和老人-女2-远新提示词结果回复; result=用户确认这版可以继续完成流程；两张结果通过，4次真实调用含2次主模型HTTP500及2次回退成功，用量见artifacts/portrait-verification-v3/requests.json。
- 2026-09-09 | H-01新提示词获用户验收支持：保留自然表情、露齿和皱纹；每张仍经AI，未加入绕过分支。原v2结果不恢复验收。
- 2026-09-09 | v3批准：用户明确全部照片仍经AI，并追加最多4次近远景验证。已修正提示词和验收，T-02沿用，T-01重新检查。新增额度独立保存于artifacts/portrait-verification-v3。
- 2026-09-09 | H-01被用户验收反驳：生成图改变人物特征且表情过于严肃。撤回T-01通过结论，原接口请求证据仍保留于artifacts/portrait-verification/requests.json，但不能作为保真通过证据。用户确认三张原图已审核可直接制作，应作为保真基准。
- 2026-09-09 | 用户授权修正提示词：优先保留人物特征及原有笑容，只规范远景取景，移除强制闭嘴和严格转正。尚未用新提示词生图；六次调用额度已用完。流程是否改为合格直用和本地裁切先行已询问，角色管理等已完成代码保留。
- 2026-09-09 | T-02 | evidence: type=test; locator=node --experimental-strip-types --test packages/avatar/management.test.ts packages/avatar/store.test.ts packages/avatar/queue.test.ts; result=管理2项及存储队列3项通过，涵盖处理中编辑归档、重启字段保留、API隔离和不复活；npm run check通过。
- 2026-09-09 | 批准并启动；既有未提交变动保留。计划仅规范化ID格式以通过验证，未改变批准范围。
- 2026-09-09 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-09 | state: IN_PROGRESS -> COMPLETED | reason: 全部验收通过

## 完成标准
- A-01 | evidence: type=manual; locator=用户2026-09-09新图验收及artifacts/portrait-verification-v3/requests.json; result=青年近景与老人女远景已获用户认可；4次请求已用完，主模型两次500，回退两次成功。
- A-02 | evidence: type=test; locator=packages/avatar/management.test.ts 与 packages/avatar/store.test.ts; result=字段持久化、软删除保留资源并隔离读取通话、重启及旧写入不复活均通过。
- A-03 | evidence: type=artifact; locator=artifacts/role-flow/1788966970593/verification.json; result=响应重放与实际本地制作打通，批内独立失败，成功图复用，实时通话抢占和恢复通过；全套测试验证回退及重启检查点。
- A-04 | evidence: type=artifact; locator=artifacts/role-flow/1788966970593/browser-verification.json; result=绿色接听前零活动会话、接听后麦克风就绪，挂断和等待返回均释放；新角色各三轮豆包语音收到且嘴部发生变化。
- A-05 | evidence: type=file; locator=docs/ROLE_MANAGEMENT_NORMALIZATION.md; result=实现规则、主模型500的限制、测试62/62及浏览器验收已同步文档和两份PRD。
- overall | evidence: type=artifact; locator=artifacts/role-flow/1788966970593/browser-verification.json; result=用户认可的新图已制作为两位可通话角色；62项测试及构建通过；原角色保留；最终服务重启成功；已披露主模型故障及固定音频测试不替代长期主观同步验收。
- 全部T项可复核通过，主/回退实图证据、软删除不复活、通话前零连接、批量与通话恢复通过；构建及相关测试通过。未经实际观察不宣称保真质量通过。
