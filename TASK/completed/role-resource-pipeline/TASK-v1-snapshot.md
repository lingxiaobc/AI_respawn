---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: role-resource-pipeline
plan_id: PT-role-resource-pipeline
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05,S-06
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06
approved_plan_digest: sha256:0337c6411574750962c53bb0197d5d02707b82bcecd73eeedddc3c560ec06ca8
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-04,M-05,M-07,M-08,M-09
execution_status: PAUSED
created_at: 2026-09-05
updated_at: 2026-09-05
---
# 单角色流水线开发记录
## 任务目标与批准快照
- 目标：单图上传到待用户审查。
- 主要诊断：独立脚本缺少统一状态/账本。
- 指导方针：统一持久化、串行、失败关闭、缓存复用。
- 近端目标：已有真实缓存完成无付费端到端验证。
- 主动不做：付费生图、部署、完整账号、生产访问。
- 批准依据：用户“全部批准并执行”，PT-role-resource-pipeline v1。
- 路由快照：full、高风险、混合。
- 已选模块：M-01,M-02,M-03,M-04,M-05,M-07,M-08,M-09。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04; S-05 -> A-05; S-06 -> A-06
## 变更范围
- 涉及模块或目录：packages、apps、scripts、docs、TASK。
- 预计影响文件数：约20。
- 允许的工具与权限：本地编辑/测试、隔离Linux安装验证、只读审查。
- 禁止或需另行批准：新增付费、生产访问、部署、提交推送。
## 行动执行契约
| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 现有队列/缓存/历史调用 | 角色ID、任务版本、输入哈希、阶段/结果合同、原子状态与规范化+donor预算适配 | none | 批准后仓库写入及无付费测试 | 重复提交同幂等键只建一次任务，同图可独立角色但素材缓存与审查隔离；历史账本不覆写不漏计 | 迁移不匹配隔离记录、禁发请求，不猜测删除旧锁 |
| A-02 | 输入图片/规范图/CPU模型/当前遮罩脚本 | 单图预检、规范后五官定位、规则指标报告与明确错误码 | A-01 | 本地CPU执行、代码编辑；不调用远程识别 | 文件/尺寸/解码/单脸/模糊和几何异常可拦截；坐标有限、五官大小位置/倾斜/遮罩界限通过；报告阈值不宣称绝对准确 | 停本角色于该阶段并给原因，不进入后续付费步骤 |
| A-03 | 状态合同/预检/已有生成组装脚本 | 规范化到四态生成/配准/图集/导出/审计统一服务及CLI | A-01,A-02 | 仓库写入、隔离子进程、缓存/模拟响应 | worker并发1；浏览器离开不停止；已校验成功复用；失败停本角色；重启仅恢复确定安全步骤，已发付费未知不重发；无泄密；raw供体先持久化 | 记录阶段HTTP耗时错误码和完成未知；保留候选，不更新批准版本；无权限不清锁 |
| A-04 | 角色服务/API/动画预览 | 每次一图角色入口、任务列表/详情、预览、通过/不通过及备注 | A-03 | 本地页面/API编辑和浏览器验证 | 前后端都拒绝多图；展示真实阶段而非伪进度；刷新可恢复；审查绑定资源版本和哈希，旧审批不迁给新资源；技术通过仅待审查 | 渲染/审核失败保持原状态；禁止自动重生成和自动批准 |
| A-05 | 青年真实缓存/其它本地图/可控供应商故障 | 自动测试、回归报告、用户可打开预览及窄范围安全审查结果 | A-04 | 无付费测试、本地浏览器、按仓库规则只读review子代理 | 重复点击/双worker/断网/坏JSON/响应中断/坏缓存/进程终止/重启/路径越界/未授权API都可验证；63帧外差异0、口型范围/独立参数/静音通过；10项误报场景入自动测试 | 安全回归不通过停交付；效果不达标回到定位/组装，不增加生图 |
| A-06 | 完整服务/测试资源/依赖锁定 | Ubuntu22.04隔离验证、无GPU启动及检查脚本、进程组内存/阶段耗时报告、运行手册 | A-05 | 本地隔离环境及依赖/浏览器下载；不访问生产、不公开端口 | 消除Windows绝对路径/msedge依赖；本地处理+headless浏览器串行，峰值进程组目标<=1.5GiB，超标不得称服务器通过；记录手机视口而非冒充真机；默认loopback、管理接口最小访问保护；运行文档可复现 | 无隔离权限/内存超限明确未验收，优化本地串行释放或请求权限；不动生产服务器 |
## 任务明细
- [x] T-01 | A-01 | 建立角色任务与统一账本 | output: 角色ID、任务版本、输入哈希、阶段/结果合同、原子状态与规范化+donor预算适配 | acceptance: 重复提交同幂等键只建一次任务，同图可独立角色但素材缓存与审查隔离；历史账本不覆写不漏计
- [x] T-02 | A-02 | 建立本地输入和定位检查 | output: 单图预检、规范后五官定位、规则指标报告与明确错误码 | acceptance: 文件/尺寸/解码/单脸/模糊和几何异常可拦截；坐标有限、五官大小位置/倾斜/遮罩界限通过；报告阈值不宣称绝对准确
- [x] T-03 | A-03 | 串联串行worker和断点恢复 | output: 规范化到四态生成/配准/图集/导出/审计统一服务及CLI | acceptance: worker并发1；浏览器离开不停止；已校验成功复用；失败停本角色；重启仅恢复确定安全步骤，已发付费未知不重发；无泄密；raw供体先持久化
- [x] T-04 | A-04 | 接入单图管理页和人工审查 | output: 每次一图角色入口、任务列表/详情、预览、通过/不通过及备注 | acceptance: 前后端都拒绝多图；展示真实阶段而非伪进度；刷新可恢复；审查绑定资源版本和哈希，旧审批不迁给新资源；技术通过仅待审查
- [x] T-05 | A-05 | 补全自动回归和故障演练 | output: 自动测试、回归报告、用户可打开预览及窄范围安全审查结果 | acceptance: 重复点击/双worker/断网/坏JSON/响应中断/坏缓存/进程终止/重启/路径越界/未授权API都可验证；63帧外差异0、口型范围/独立参数/静音通过；10项误报场景入自动测试
- [ ] T-06 | A-06 | 完成Ubuntu适配与交付 | output: Ubuntu22.04隔离验证、无GPU启动及检查脚本、进程组内存/阶段耗时报告、运行手册 | acceptance: 消除Windows绝对路径/msedge依赖；本地处理+headless浏览器串行，峰值进程组目标<=1.5GiB，超标不得称服务器通过；记录手机视口而非冒充真机；默认loopback、管理接口最小访问保护；运行文档可复现
## 发现与变更记录
- 2026-09-05 | 补充稳定性验证：重复测试发现Windows读取job.json期间rename偶发EPERM，已只针对本地原子替换加有限短重试；连续20轮pipeline.test.ts通过。新角色以完整临时目录原子发布，避免后台看到半创建角色。未重试任何供应商请求。
- 2026-09-05 | T-03 | evidence: type=artifact; locator=AI_output/role-replay-test/af8d3c57-bd14-40e4-b752-e3b8f62165e3/job.json; result=青年原上传图缓存回放完整12阶段到awaiting_review；未自动审批；共用账本仍9次，无新付费。pipeline.test.ts验证重复提交/失败暂停/恢复不重复已完成步骤和坏缓存拦截。
- 2026-09-05 | T-04 | evidence: type=artifact; locator=AI_output/role-ui-qa/report.json; result=网页单图提交、完整流水线、iframe动画预览、刷新恢复、拒绝备注持久化全部通过，390px无横向溢出且pageErrors为空；测试拒绝备注明确不代表用户审查。
- 2026-09-05 | T-05 | evidence: type=test; locator=npm test; result=74项通过；Python11项通过，tsc及diff检查通过；原10项响应误报场景进入自动回归；review_motion_safety复核确认ZIP断点恢复和旧规范图坏缓存重复付费风险已解除。
- 2026-09-05 | A-06部分进展：Dockerfile、CPU进程组测量脚本及docs/role-resource-pipeline.md已编写，浏览器不再固定msedge。Windows UI测试进程组采样峰值1540194304字节、27秒；不是Ubuntu验收。
- 2026-09-05 | A-06阻塞证据：本机WSL24.04普通用户Docker权限拒绝，以明确授权的WSL root只读检查确认Docker29.2.1可用；隔离Ubuntu22.04构建因docker.m.daocloud.io在127.0.0.53 DNS失败而未开始。官方registry-1.docker.io解析也报socket.gaierror Errno -3 Temporary failure in name resolution。未改系统DNS/代理/Docker配置；Ubuntu22.04及1.5GiB验收保持未完成。
- 2026-09-05 | T-01 | evidence: type=test; locator=node --experimental-strip-types --test packages/role-resource/state.test.ts; result=2项通过，角色幂等/独立ID、单writer、重启暂停及共享账本未知结果不重试均通过；历史目录不写入。
- 2026-09-05 | T-02 | evidence: type=command; locator=.venv-motion/Scripts/python.exe -m unittest discover -s scripts/portrait-motion -p test_*.py; result=9项通过；三规范图preflight实测通过，报告保存在AI_output/motion/youth-v2、elder-man、elder-woman/preflight.json；门限作为启发规则非准确率承诺。
- 2026-09-05 | 初始化：保留旧任务包及历史账本；无新增付费。
- 2026-09-05 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-05 | state: IN_PROGRESS -> PAUSED | reason: 前五步开发及Windows缓存/故障/UI验证通过；第六步Ubuntu22.04镜像构建受本机WSL DNS解析失败阻塞，官方仓库亦无法解析，待环境恢复；未修改系统网络配置、未新增付费或部署

## 完成标准
- 六项逐一有证据，真实缓存和模拟测试区分；用户审查不自动代办。
- Ubuntu22.04实测及峰值<=1.5GiB；未验证不能标为完成。
