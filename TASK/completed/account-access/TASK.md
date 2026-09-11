---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: account-access
plan_id: PT-account-access
plan_version: 3
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05
approved_scope: A-01,A-02,A-03,A-04,A-05
approved_plan_digest: sha256:de3914a6dd7e3b45fa4aef74215607965e0a1d338c5f31b3f1b835dddca875b5
routing_mode: auto
selected_modules: M-01,M-03,M-07,M-08,M-09
execution_status: COMPLETED
created_at: 2026-09-11
updated_at: 2026-09-11
---
## 任务目标与批准快照
- 目标：管理员建号、分配多人物，用户独立配置通话，登录和资源撤权有效。
- 近端目标：管理员发号、用户选择多个已分配人物、撤权结束旧通话。
- 主要诊断：当前共享人物入口缺少可信身份到实时连接的授权链。
- 指导方针：复用React/Node/SQLite，服务端可撤销会话、逐资源权限。
- 主动不做：不增加注册短信、用户自改密、多路通话、公网部署或付费调用。
- 批准依据：用户确认v3后“全部批准并执行”。
- 路由快照：高风险、混合可逆、跨前后端存储和实时连接。
- 已选模块：M-01,M-03,M-07,M-08,M-09。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04; S-05 -> A-05
## 变更范围
- 涉及模块或目录：apps/server、apps/web、packages、scripts、PRD和docs。
- 预计影响文件数：约34，含既有诊断脚本登录兼容、隔离测试和存储防护，均属获批账户模块及回归范围。
- 允许的工具与权限：本地代码/文档编辑，隔离测试与数据库迁移、浏览器验证、只读子代理审阅。
- 禁止或需另行批准：推送提交、部署、付费调用、删除用户历史媒体。
## 行动执行契约
| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 用户讨论结论及现有修订 | 同步两份PRD，固定角色矩阵、多对多授权、会话期限、单场并发边界和凭据初始化方式；覆盖原U01，保留单次时长等现行修订 | none | 批准后本地文档编辑 | 新旧修订不矛盾，未扩大媒体范围 | 决策未定则不建立相关约束 |
| A-02 | A-01、现有SQLite | users/auth_sessions/必要管理审计、版本迁移、初始化管理员、登录退出/me和受控运维重置入口 | A-01 | 批准后本地代码及开发数据库迁移；凭据仅受控环境或交互输入 | 重启保留账户，初始化不覆盖旧密码，Argon2id或经验证scrypt，Cookie会话、频控、CSRF/Origin，明文不持久化 | 在测试数据库验证，迁移前一致性备份；失败停止迁移并恢复备份 |
| A-03 | A-02和已确认绑定规则 | 共用登录身份自动分流、用户列表/搜索/创建/重置/启停、可多选分配已有数字人、按用户人物保存专属展示名/称呼/人设、管理员自改密；用户卡片列表仅可选授权人物，空白/未就绪/忙碌/失效状态明确 | A-02 | 批准后本地前后端修改 | USER不能调用管理API；一用户可见多个授权人物，多个用户可共享一人物；同一用户人物不可重复绑定，不覆盖他人配置；旧角色仅管理员可见；原密码不可查询；分配默认复制人设并独立保存 | 权限不明默认拒绝，回查A-01 |
| A-04 | A-02,A-03、现有通话资源锁 | 身份绑定HTTP/媒体/WS/通话，撤销版本、活动连接终止和失败清理状态 | A-02,A-03 | 批准后本地实现和隔离测试连接 | 不得跨用户读取配置/会话；重置/停用阻止新授权并撤销此账号旧登录与通话；解绑单个关联仅终止此用户对应人物通话，其他授权和他人通话保留；登录过期也结束对应通话；退出仅当前登录；管理员不抢占；单场全局限制保留 | 清理失败保持拒绝和资源占用，不报成功释放，修复关闭链路 |
| A-05 | A-01至A-04 | 自动化证据、双浏览器验收、文档和备份恢复说明 | A-04 | 本地测试、构建、临时隔离数据；无付费调用或部署 | npm test、npm run build、git diff --check；重点权限/撤销/迁移用例通过；模板验证脚本存在则运行 | 失败修复对应层，未测真实远程环境明确标注，不宣称上线完成 |
## 任务明细
- [x] T-01 | A-01 | 固定多人物授权与密码规则并同步PRD | output: 两份PRD与账户说明 | acceptance: 批准规则与文件核对一致
- [x] T-02 | A-02 | 持久账户、会话、初始化和恢复实现与基础测试 | output: 认证模块与基础测试 | acceptance: 持久化、哈希、撤销及初始化测试通过
- [x] T-03 | A-03 | 管理员与用户页面及人物关联配置 | output: 账户与人物管理界面 | acceptance: 管理员可管理、用户仅见授权且独立配置
- [x] T-04 | A-04 | HTTP媒体和实时通话权限与撤销闭环 | output: 网关授权和撤权接入 | acceptance: 未授权HTTP和WS失败、撤权关闭旧通话
- [x] T-05 | A-05 | 测试构建双浏览器验收及安全审阅 | output: 验证证据和交付文档 | acceptance: 全量测试构建与双浏览器权限场景通过
## 发现与变更记录
- 2026-09-11 | T-05 | evidence: type=test; locator=npm.cmd test / npm.cmd run build / npm.cmd run avatar:verify / scripts/verify-accounts-browser.ts; result=67/67测试、生产构建、12项资源验证、双浏览器账户流程与私有文件访问拦截通过
- 2026-09-11 | A-01 | evidence: type=file; locator=docs/AI_Avatar_Demo_PRD_Development_V0.2.md:4; result=两份PRD同步12位默认密码、多对多授权和独立配置规则
- 2026-09-11 | A-02 | evidence: type=test; locator=packages/avatar/auth-store.test.ts and packages/avatar/auth-service.test.ts; result=持久账户、哈希、会话、初始化和重置撤销通过；本地管理员已初始化
- 2026-09-11 | A-03 | evidence: type=artifact; locator=artifacts/account-verification/result.json; result=浏览器建号、多选分配、用户列表隔离和专属设定编辑通过
- 2026-09-11 | A-04 | evidence: type=test; locator=packages/avatar/account-gateway.test.ts; result=HTTP媒体及WS越权拒绝、按用户提示词、重置解绑与过期结束通话通过
- 2026-09-11 | A-05 | evidence: type=manual; locator=独立审阅代理01a08f7d-9b7a-7d01-8632-c6415c59068a于2026-09-11最终复核; result=前两轮发现已关闭，复核无仍有实际影响问题；其不重复磁盘浏览器测试的限制已注明
- 2026-09-11 | overall | evidence: type=artifact; locator=docs/ACCOUNTS.md; result=本地账户闭环已完成，67项测试与浏览器验证通过，12条历史人物记录与备份一致；服务已在5173启动，未提交推送部署或调用付费模型
- 2026-09-11 | H-01/H-02 | 证据支持：模拟实时通话重置与解绑关闭旧连接；本机数据库与迁移前备份逐条record比较一致。真实公网和真人音视频未测试。
- 2026-09-11 | 验证范围 | 当前仓库不存在scripts/validate_codex_template.py及tests目录，改用本应用Node验证；未宣称缺失模板验证通过。
- 2026-09-11 | T-03 | evidence: type=artifact; locator=artifacts/account-verification/result.json; result=双浏览器创建用户、生成12位密码、分配两人物、专属设定、用户控件隔离和390px页面无溢出通过
- 2026-09-11 | T-04 | evidence: type=test; locator=node --experimental-strip-types --test packages/avatar/account-gateway.test.ts; result=HTTP/HEAD/Range/WS授权隔离通过；共享角色提示词独立；并发仅一路；密码重置、准备期间解绑和到期关闭受影响通话
- 2026-09-11 | 安全审阅 | 修复Vite私有文件访问路径和撤权上传残留；初始测试密码例外改为显式本机非production开关，其余初始化默认12位
- 2026-09-11 | T-02 | evidence: type=test; locator=node --experimental-strip-types --test packages/avatar/auth-store.test.ts packages/avatar/auth-service.test.ts; result=2项通过，覆盖初始化幂等、持久账户、scrypt哈希、Cookie、跨站防护、频控、重置停用撤销及独立配置
- 2026-09-11 | T-01 | evidence: type=command; locator=rg -n '2026-09-11 账户与授权修订' AI_Avatar_Demo_PRD_Development_V0.2.md docs/AI_Avatar_Demo_PRD_Development_V0.2.md; result=两份PRD具有相同获批v3规则并显式覆盖旧U01/U02和账号后移口径
- 2026-09-11 | 初始化 | 现有人物使用SQLite，全系统单一hold。批准保留单场通话。尚未执行验收。
- 2026-09-11 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-11 | state: IN_PROGRESS -> COMPLETED | reason: 全部验收通过

## 完成标准
- A-01 | evidence: type=file; locator=docs/AI_Avatar_Demo_PRD_Development_V0.2.md:4; result=两份PRD同步12位默认密码、多对多授权及独立配置
- A-02 | evidence: type=test; locator=packages/avatar/auth-store.test.ts and packages/avatar/auth-service.test.ts; result=持久账户、哈希、会话、初始化和重置撤销测试通过
- A-03 | evidence: type=artifact; locator=artifacts/account-verification/result.json; result=两个独立浏览器完成建号、多人物分配、专属设定与用户控件隔离
- A-04 | evidence: type=test; locator=packages/avatar/account-gateway.test.ts; result=HTTP/HEAD/Range/WS拒绝越权，重置解绑及过期关闭受影响连接
- A-05 | evidence: type=command; locator=npm.cmd test / npm.cmd run build / npm.cmd run avatar:verify / git diff --check; result=67项测试、生产构建、12项资源验证和差异检查通过，独立安全复核关闭已发现问题
- overall | evidence: type=artifact; locator=docs/ACCOUNTS.md; result=账户闭环及双浏览器验收通过，管理员已初始化，12条历史人物记录与备份一致，服务在5173运行
- 所有任务逐项具备证据；独立审阅已处理；本地测试构建通过；既有人物资料保持且不默认暴露给新用户。真实公网与真人通话验收不在本轮声明范围。
