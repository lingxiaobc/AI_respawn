---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: frontend-calm
plan_id: PT-frontend-calm
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04
approved_scope: A-01,A-02,A-03,A-04
approved_plan_digest: sha256:ce9c0e5ec3ead907ccd7359d180502a2f412c8303727fb9a6aca57e7deda19ea
routing_mode: auto
selected_modules: M-01,M-03
execution_status: COMPLETED
created_at: 2026-09-11
updated_at: 2026-09-11
---
# 前端视觉优化执行
## 任务目标与批准快照
- 目标：全前端统一视觉，保留业务与后端。
- 主要诊断：D-01 两套样式混用导致层级与跨页不一致。
- 指导方针：G-01,G-02 共享规则、页面构图分层，沿用深色绿色品牌。
- 近端目标：O-01,O-02 页面可读可操作，隔离验证及独立复核。
- 主动不做：NG-01,NG-02 无新主题/依赖，无业务或后端变动。
- 批准依据：用户于2026-09-11回复“全部批准并执行”。
- 路由快照：auto；标准风险；可逆；共享样式跨页依赖。
- 已选模块：M-01,M-03
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04
## 变更范围
- 涉及模块或目录：apps/web/src 的展示层，TASK，隔离验证脚本及截图。
- 预计影响文件数：最多6个前端文件，另加追踪和验证产物。
- 允许的工具与权限：apply_patch、本地测试、隔离浏览器、只读视觉代理。
- 禁止或需另行批准：后端、业务事件/状态/请求、真实数据写入、依赖增加、付费调用、提交推送部署。
## 行动执行契约
| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 当前样式与各组件基线 | 深墨绿/暖白 tokens、字号间距、按钮输入焦点状态和必要的作用域 | none | 获批后前端展示文件、TASK及隔离验证产物 | 样式统一且控件状态可分辨，实施前后受保护代码/后端哈希不变；不新增依赖 | 全局回归时缩小规则作用域；需要业务变化则停止该处并询问 |
| A-02 | A-01 与现有登录/用户/人物/管理员账户/弹窗 | 清晰登录焦点、列表详情分组、统一表单及弹窗 | A-01 | C-01,C-03限定展示写入及隔离验证 | 原按钮、字段、状态提示、分配与专属设定入口全部保留；桌面及320/390px布局无重要裁切 | 控件丢失或任务关系受损则退回该局部布局；不修改处理逻辑补偿 |
| A-03 | A-01 与人物库/通话/诊断页现状 | 人像优先卡片、清晰状态、沉浸式通话控制及诊断页一致样式 | A-01 | C-01,C-03限定展示写入及隔离验证，禁止真实付费通话 | 所有卡片功能及待接听/进行中/结束/报错/纯音频控件保留；移动和横屏可访问；不变更媒体尺寸契约或iframe内部实现 | 控件遮挡时先重排CSS；需要更改音视频逻辑则停止并询问 |
| A-04 | A-02,A-03产物与实施前基线 | 隔离测试截图/结果、独立只读视觉复核及最终差异核对 | A-02,A-03 | 本地检查、测试数据、验证脚本/截图、只读代理；无真实数据写入或外部发布 | npm check/test/build通过；键盘/焦点/缩放/减少动态效果/长内容及空错态检查；桌面、320/390px及横屏截图无重要裁切；后端及业务代码无本轮变化；独立复核重大问题已解决或明确未验证边界 | 确认缺陷在展示范围内修正并定点复核；行为测试失败先区分基线，禁止越界修复；真机不可用时明确局限不声称真机通过 |
## 任务明细
- [x] T-01 | A-01 | 建立视觉tokens与统一控件 | output: styles.css及受保护文件基线 | acceptance: 统一语义状态、无新依赖、后端及业务哈希一致
- [x] T-02 | A-02 | 重排登录与管理表单 | output: 登录/管理/弹窗桌面及窄屏截图 | acceptance: 全部字段操作保留且320/390px不裁切
- [x] T-03 | A-03 | 优化人物与通话构图 | output: 卡片及通话各状态截图 | acceptance: 原入口与媒体契约保留、移动横屏可访问、无付费调用
- [x] T-04 | A-04 | 回归和独立视觉验收 | output: 浏览器结果及只读复核记录 | acceptance: check/test/build、布局键盘长内容空错态及边界检查通过，重大问题解决
## 发现与变更记录
- 2026-09-11 | T-04 | evidence: type=artifact; locator=artifacts/frontend-design-accepted/result.json; result=38张截图与隔离功能测试通过；独立复核两处重大遮挡修正后通过；67项测试和构建通过，原后端与业务哈希不变，限制详见REVIEW.md
- 2026-09-11 | T-03 | evidence: type=artifact; locator=artifacts/frontend-design-accepted/result.json; result=38张页面/状态截图，320/390px及横屏布局通过；待接听无上游，模拟连接/倒计时/纯语音/结束与诊断可操作；后端与业务组件未改
- 2026-09-11 | H-01 支持：独立只读复核确认配色统一、管理页减少嵌套且扫描主线清楚；发现横屏状态叠印后已改为独立布局行并定点复核。尚未验证真实用户效率。
- 2026-09-11 | T-02 | evidence: type=artifact; locator=artifacts/frontend-design/result.json; result=登录、创建用户、独立设定和分配回归通过，320/390px及放大文字无横向裁切，表单全部保留
- 2026-09-11 | 既有账户弹窗卸载后不恢复触发按钮焦点，Tab仍可操作；本轮保持业务/交互代码未变，作为原有限制记录。
- 2026-09-11 | T-01 | evidence: type=command; locator=npm.cmd run check + Get-FileHash apps/server/src/*; result=类型检查通过，后端哈希与本轮基线一致；仅建立CSS语义token，业务文件和依赖未改，页面控件应用在后续步骤统一验证
- 2026-09-11 | 用户批准整体版本，使用隔离测试数据。
- 2026-09-11 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-11 | state: IN_PROGRESS -> COMPLETED | reason: 全部验收通过

## 完成标准
- A-01 | evidence: type=artifact; locator=TASK/completed/frontend-calm/boundary-and-contrast.json; result=共享tokens统一，7组对比检查达标，后端/原业务/依赖哈希一致
- A-02 | evidence: type=artifact; locator=artifacts/frontend-design-accepted/result.json; result=登录管理表单及原操作回归通过，320/390px与200%字体检查通过
- A-03 | evidence: type=artifact; locator=artifacts/frontend-design-accepted/result.json; result=人物状态长内容和通话多状态可访问、横屏叠印已消除、0真实上游调用
- A-04 | evidence: type=artifact; locator=TASK/completed/frontend-calm/REVIEW.md; result=测试67/67、类型检查和构建通过，独立只读定点复核无新增遮挡；保留既有焦点与真机限制
- overall | evidence: type=artifact; locator=TASK/completed/frontend-calm/REVIEW.md; result=批准的全前端展示优化已落地，仅应用CSS变化，功能/后端未改，隔离验证及独立复核通过且限制已记录
- A-01至A-04通过各自验收，独立复核后重大问题解决。
- 真机键盘、安全区域未经实机验证须如实声明。
