---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: portrait-motion-batch
plan_id: PT-portrait-motion-batch
plan_version: 1
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05,S-06
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06
approved_plan_digest: sha256:ff0078a49e5d41d11fcd5dfd34b41059f4d16e54f82bde83acf26cce69addd67
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-04,M-07,M-08,M-09
execution_status: PAUSED
created_at: 2026-09-04
updated_at: 2026-09-04
---

# 批量嘴眼动画资源执行记录

## 任务目标与批准快照

- 目标：四张规范人像生成可复用嘴眼动画资源并验证CPU执行。
- 主要诊断：局部纹理须几何和光照一致，单图重影不能靠扩大批量解决。
- 指导方针：完整底图锁定；独立半态；先单图后批量；串行、缓存、账本。
- 近端目标：青年样本通过缓慢开合及组合动画，再扩展四图。
- 主动不做：Cubism手工绑定、账号、豆包接入、GPU推理、生产部署。
- 批准依据：用户回复“全部批准并执行。”，PLAN v1。
- 路由快照：full，auto，高风险，混合可逆。
- 已选模块：M-01,M-02,M-03,M-04,M-07,M-08,M-09。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04; S-05 -> A-05; S-06 -> A-06

## 变更范围

- 涉及模块或目录：packages、apps/server、apps/web、scripts、docs、AI_output/motion、TASK。
- 预计影响文件数：约20个代码/文档文件及生成产物。
- 允许的工具与权限：本地实现、CPU依赖安装、隔离Linux验证、最多17次ZenMux生图。
- 禁止或需另行批准：超过17次、自动付费重试、生产服务器访问、部署、提交、推送、扩大运动边界。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 三张已通过规范图 | 定位脚本、各图 ROI/遮罩和底图哈希 | none | 仓库写入；安装本地 CPU 依赖与模型 | 三张图均可定位嘴眼，底图完整不透明，定位无固定人物坐标 | 定位失败隔离样本；共性定位失败停止生图 |
| A-02 | 青年规范图及已验证 ROI | 独立嘴半/开、眼半/闭 donor，透明局部图层和资源配置 | A-01 | ZenMux 最多四次付费生图；本地输出写入 | 素材对齐且蒙版外零差异，半态独立，输出可解码 | 保留失败素材；不重试付费请求；共性素材问题停止扩展 |
| A-03 | 青年局部资源包 | 网页嘴眼滑块、独立参数、眨眼、测试音频与动态 QA | A-02 | 本地代码写入、浏览器与离线测试 | 默认/半态/终态/中间值及组合可用，无明显重影接缝，静音闭嘴 | 先修对齐或渲染，不追加付费候选；仍失败停止扩展 |
| A-04 | 通过单图验证的定位、素材、动画接口 | 共享后端、串行 CLI、任务列表、缓存和失败记录 | A-03 | 仓库代码写入和本地测试 | 顺序处理、成功复用、重启不自动付费重试，失败证据可读 | 阻止不确定状态再次调用；失败项隔离 |
| A-05 | 另外两张规范图与 image/老人1.png | 四套资源包、状态联系表、动画预览与审查报告 | A-04 | 新增规范图一次与剩余局部素材最多十二次 ZenMux 调用 | 首张动态闸门先通过，四图分别验收，全部新增调用不超过十七次 | 单图失败隔离；共性失败停止；超预算另请授权 |
| A-06 | 完整流水线和四图产物 | 隔离 Linux 检查脚本、峰值内存与耗时记录、回归报告 | A-05 | 本地隔离 Linux 环境与依赖安装；不访问生产服务器 | Ubuntu 无 GPU/桌面执行通过，进程组内存不超过 1.5 GiB，项目回归通过 | 无法实测不声称兼容完成；超内存优化串行释放，未达标暂停 |

## 任务明细

- [x] T-01 | A-01 | 建立资源合同与 CPU 自动定位 | output: 定位脚本、各图 ROI/遮罩和底图哈希 | acceptance: 三张图均可定位嘴眼，底图完整不透明，定位无固定人物坐标
- [ ] T-02 | A-02 | 打通青年样本的局部素材与资源生产 | output: 独立嘴半/开、眼半/闭 donor，透明局部图层和资源配置 | acceptance: 素材对齐且蒙版外零差异，半态独立，输出可解码
- [ ] T-03 | A-03 | 实现交互动画预览与动态效果检测 | output: 网页嘴眼滑块、独立参数、眨眼、测试音频与动态 QA | acceptance: 默认/半态/终态/中间值及组合可用，无明显重影接缝，静音闭嘴
- [ ] T-04 | A-04 | 接入批处理、任务列表和失败记录 | output: 共享后端、串行 CLI、任务列表、缓存和失败记录 | acceptance: 顺序处理、成功复用、重启不自动付费重试，失败证据可读
- [ ] T-05 | A-05 | 扩展至四个人物并审查 | output: 四套资源包、状态联系表、动画预览与审查报告 | acceptance: 首张动态闸门先通过，四图分别验收，全部新增调用不超过十七次
- [ ] T-06 | A-06 | 验证 Ubuntu CPU 兼容与内存约束 | output: 隔离 Linux 检查脚本、峰值内存与耗时记录、回归报告 | acceptance: Ubuntu 无 GPU/桌面执行通过，进程组内存不超过 1.5 GiB，项目回归通过

## 发现与变更记录

- 2026-09-04 | 阻塞：首个mouth-half请求fetch failed，账本674a3f21bfb0095fcc53a8429a48aa515b0a589f66895b6fad37239dd5d74302.json记录failed-or-unknown；未获得图片或request ID；不假设未扣费。后续命令被账本阻止，未发第二次请求。
- 2026-09-04 | 验证：npm test 54/54通过；npm run check通过；git diff --check通过；CPU定位unittest 4/4通过。新增损坏缓存拒绝、精确密钥脱敏及错误回显回归。A02尚未通过，不进入A03或扩大批量。
- 2026-09-04 | 审查：只读review_motion_safety发现报错脱敏漏洞，已补配置密钥精确移除；确认A05新增规范化必须接入同一账本，当前未执行A05。
- 2026-09-04 | 待授权：是否允许失败请求额外尝试一次并将全批上限17改为18；等待答复，未改批准方案及预算常量。

- 2026-09-04 | T-01 | evidence: type=artifact; locator=AI_output/motion/{youth,elder-man,elder-woman}/landmarks.json; result=三图单脸478点定位成功、底图全不透明、各自ROI无重叠；三张landmark-review.png已目视检查
- 2026-09-04 | A-01 | evidence: type=command; locator=.venv-motion/Scripts/python.exe scripts/portrait-motion/prepare.py; result=三张指定规范图通过，单张定位0.438至1.047秒
- 2026-09-04 | 发现：本机WSL为Ubuntu24.04，尚非目标22.04；青年原图有轻微露齿，静音态需遮罩内几何闭合，原始完整底图不改。

- 2026-09-04 | 初始化：复用已通过的三张规范图；新增样本选老人1.png。根AGENT.md不存在，保留警告；遵循用户提供规则。
- 2026-09-04 | state: PENDING -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-04 | state: IN_PROGRESS -> PAUSED | reason: 首个付费请求失败且完成状态未知，按无重试边界等待一次性重试授权

## 完成标准

- 首图动态闸门通过后再扩展；四图逐项记录，不掩盖失败。
- 所有遮罩外像素零差异；输出资源可解码、参数独立、静音闭嘴。
- 实际新增付费调用不超过17次，不自动重试。
- Ubuntu无GPU无桌面实测进程组峰值不超过1.5 GiB；项目回归通过。无法实测则保持未完成。
