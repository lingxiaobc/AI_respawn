---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: dh-live-mini
plan_id: PT-dh-live-mini
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03
approved_scope: A-01,A-02,A-03
approved_plan_digest: sha256:d78109420781e308059bbc831b3fc667a7907810e0008cfa26af956005062cf9
routing_mode: auto
selected_modules: M-01,M-03,M-07
execution_status: COMPLETED
created_at: 2026-09-07
updated_at: 2026-09-07
---
# DH_live_mini 开发测试
## 任务目标与批准快照
- 目标：固定人物浏览器驱动接入豆包并测试。
- 主要诊断：音频与嘴型队列时钟不同会导致不同步。
- 指导方针：先示例后桥接，单声音出口。
- 主动不做：自动人物制作、购买、部署、后台。
- 批准依据：用户本轮要求采用第一推荐开发测试并新分支。
- 路由快照：标准风险、可逆、接口未知、强依赖、单代理。
- 已选模块：M-01,M-03,M-07
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03
- 近端目标：固定人物音频驱动小样与本地测试证据。
## 变更范围
- 涉及模块或目录：apps/web、packages/audio及新增avatar、scripts、docs、TASK
- 预计影响文件数：15至25
- 允许的工具与权限：本地编辑、Git、公开下载、离线/本地浏览器测试、现有豆包链路。
- 禁止或需另行批准：购买、公开部署、上传人物私人素材、修改现有未跟踪PRD。
## 行动执行契约
| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 项目和上游官方代码 | 固定版本资源清单及可加载示例 | none | 本地分支编辑、下载公开资源 | 版本和资源完整，最小人物页面可加载 | 资源缺失或授权不明时停止该资源使用并报告 |
| A-02 | A-01运行资源及24kHz PCM16流 | 单声音出口的数字人播放桥接 | A-01 | 本地编辑与测试；沿用豆包测试凭证，不购买 | 分片连续，播完回执正确，故障可退纯语音 | 音频或嘴型异常回查桥接，不冒充效果通过 |
| A-03 | A-02实现和测试音频 | 检查结果、浏览器证据和运行说明 | A-02 | 离线测试与本地浏览器；测试豆包，不保存真实麦克风 | 静态检查测试构建通过；固定音频浏览器验证；实际通话未覆盖项如实记录 | 检查失败修复；不可用环境保留未完成验收项 |
## 任务明细
- [x] T-01 | A-01 | 锁定并验证网页运行资源 | output: 固定版本资源清单及可加载示例 | acceptance: 版本和资源完整，最小人物页面可加载
- [x] T-02 | A-02 | 接入固定音频和豆包流 | output: 单声音出口的数字人播放桥接 | acceptance: 分片连续，播完回执正确，故障可退纯语音
- [x] T-03 | A-03 | 验证连续性与交付效果 | output: 检查结果、浏览器证据和运行说明 | acceptance: 静态检查测试构建通过；固定音频浏览器验证；实际通话未覆盖项如实记录
## 发现与变更记录
- 2026-09-07 | 新分支已建立；上游锁定4467e97cd97194c2c54762043cf121c6d313db12。GitHub API限流，改用固定提交raw下载，未运行上游安装程序。
- 2026-09-07 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行

- 2026-09-07 | T-01 | evidence: type=artifact; locator=apps/web/public/dh-live/frame.html; result=内置浏览器显示固定人物，WASM初始化及人物资源解压通过，分片示例首次播完计数为1。
- 2026-09-07 | T-02 | evidence: type=test; locator=docs/DH_LIVE_MINI.md; result=真实豆包三轮返回441772、287414、326210字节PCM，人物播完回执后均回到ready；阻断WASM请求后纯语音入口可用，已恢复网络设置。
- 2026-09-07 | T-03 | evidence: type=test; locator=docs/DH_LIVE_MINI.md; result=42项测试、类型检查、构建及12项资源哈希通过；主页面示例连续3次完成，静音有声对照完成；外部Chrome与真实麦克风主观效果未覆盖项已记录。
- 2026-09-07 | 验收范围：固定人物浏览器驱动原型交付；内置Chromium替代外部Chrome完成自动联调，用户实际麦克风与主观观感保留现场试用。
- 2026-09-07 | state: IN_PROGRESS -> COMPLETED | reason: 全部验收通过

## 完成标准
- 检查构建通过；真实推理小样可试用；未覆盖的麦克风听感、相似度、长期连续性明确记录，不以离线检查替代。
- A-01 | evidence: type=artifact; locator=apps/web/public/dh-live/manifest.json; result=固定提交的12项运行资源随仓库保存，完整性命令返回通过，浏览器显示人物。
- A-02 | evidence: type=test; locator=docs/DH_LIVE_MINI.md; result=三轮真实豆包语音经人物播放结束回执后返回ready；资源失败自动切换纯语音入口。
- A-03 | evidence: type=test; locator=docs/DH_LIVE_MINI.md; result=42项测试和构建通过，重复播放及静音有声对照完成，记录实际麦克风等未覆盖项。
- overall | evidence: type=artifact; locator=docs/DH_LIVE_MINI.md; result=固定人物浏览器原型可在localhost5173试用；已交付运行、三轮联调和授权边界说明，未承诺主观口型验收或生产就绪。



