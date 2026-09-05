---
task_schema: plan-tasks-tracker/v3
plan_schema: rumelt-task-plan/v2
task_slug: portrait-motion-batch
plan_id: PT-portrait-motion-batch
plan_version: 2
plan_status: APPROVED
approved_by: user
approved_steps: S-01,S-02,S-03,S-04,S-05,S-06
approved_scope: A-01,A-02,A-03,A-04,A-05,A-06
approved_plan_digest: sha256:0941cb91e5b6ec6f8873a6884a91e123e1b2b06db282af6f2494de11d3c5fbda
routing_mode: auto
selected_modules: M-01,M-02,M-03,M-04,M-07,M-08,M-09
execution_status: PAUSED
created_at: 2026-09-04
updated_at: 2026-09-05
---

# 批量嘴眼动画资源执行记录

## 任务目标与批准快照

- 目标：四张规范人像生成可复用嘴眼动画资源并验证CPU执行。
- 主要诊断：局部纹理须几何和光照一致，单图重影不能靠扩大批量解决。
- 指导方针：完整底图锁定；独立半态；先单图后批量；串行、缓存、账本。
- 近端目标：青年样本通过缓慢开合及组合动画，再扩展四图。
- 主动不做：Cubism手工绑定、账号、豆包接入、GPU推理、生产部署。
- 批准依据：用户回复“全部批准并执行。”，PLAN v2，用户已批准首个失败请求额外重试一次及18次上限。
- 路由快照：full，auto，高风险，混合可逆。
- 已选模块：M-01,M-02,M-03,M-04,M-07,M-08,M-09。
- 用户步骤映射：S-01 -> A-01; S-02 -> A-02; S-03 -> A-03; S-04 -> A-04; S-05 -> A-05; S-06 -> A-06

## 变更范围

- 涉及模块或目录：packages、apps/server、apps/web、scripts、docs、AI_output/motion、TASK。
- 预计影响文件数：约20个代码/文档文件及生成产物。
- 允许的工具与权限：本地实现、CPU依赖安装、隔离Linux验证、最多18次ZenMux生图。
- 禁止或需另行批准：超过18次、自动付费重试、生产服务器访问、部署、提交、推送、扩大运动边界。

## 行动执行契约

| action_id | input | output | dependencies | permissions | acceptance | failure_response |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | 三张已通过规范图 | 定位脚本、各图 ROI/遮罩和底图哈希 | none | 仓库写入；安装本地 CPU 依赖与模型 | 三张图均可定位嘴眼，底图完整不透明，定位无固定人物坐标 | 定位失败隔离样本；共性定位失败停止生图 |
| A-02 | 青年规范图及已验证 ROI | 独立嘴半/开、眼半/闭 donor，透明局部图层和资源配置 | A-01 | ZenMux 最多五次尝试（含首个失败及一次授权重试）；本地输出写入 | 素材对齐且蒙版外零差异，半态独立，输出可解码 | 保留失败素材；仅首个mouth-half允许一次授权重试，其余不自动重试；共性素材问题停止扩展 |
| A-03 | 青年局部资源包 | 网页嘴眼滑块、独立参数、眨眼、测试音频与动态 QA | A-02 | 本地代码写入、浏览器与离线测试 | 默认/半态/终态/中间值及组合可用，无明显重影接缝，静音闭嘴 | 先修对齐或渲染，不追加付费候选；仍失败停止扩展 |
| A-04 | 通过单图验证的定位、素材、动画接口 | 共享后端、串行 CLI、任务列表、缓存和失败记录 | A-03 | 仓库代码写入和本地测试 | 顺序处理、成功复用、重启不自动付费重试，失败证据可读 | 阻止不确定状态再次调用；失败项隔离 |
| A-05 | 另外两张规范图与 image/老人1.png | 四套资源包、状态联系表、动画预览与审查报告 | A-04 | 新增规范图一次与剩余局部素材最多十二次 ZenMux 调用 | 首张动态闸门先通过，四图分别验收，全部新增调用不超过十八次 | 单图失败隔离；共性失败停止；超预算另请授权 |
| A-06 | 完整流水线和四图产物 | 隔离 Linux 检查脚本、峰值内存与耗时记录、回归报告 | A-05 | 本地隔离 Linux 环境与依赖安装；不访问生产服务器 | Ubuntu 无 GPU/桌面执行通过，进程组内存不超过 1.5 GiB，项目回归通过 | 无法实测不声称兼容完成；超内存优化串行释放，未达标暂停 |

## 任务明细

- [x] T-01 | A-01 | 建立资源合同与 CPU 自动定位 | output: 定位脚本、各图 ROI/遮罩和底图哈希 | acceptance: 三张图均可定位嘴眼，底图完整不透明，定位无固定人物坐标
- [x] T-02 | A-02 | 打通青年样本的局部素材与资源生产 | output: 独立嘴半/开、眼半/闭 donor，透明局部图层和资源配置 | acceptance: 素材对齐且蒙版外零差异，半态独立，输出可解码
- [ ] T-03 | A-03 | 实现交互动画预览与动态效果检测 | output: 网页嘴眼滑块、独立参数、眨眼、测试音频与动态 QA | acceptance: 默认/半态/终态/中间值及组合可用，无明显重影接缝，静音闭嘴
- [ ] T-04 | A-04 | 接入批处理、任务列表和失败记录 | output: 共享后端、串行 CLI、任务列表、缓存和失败记录 | acceptance: 顺序处理、成功复用、重启不自动付费重试，失败证据可读
- [ ] T-05 | A-05 | 扩展至四个人物并审查 | output: 四套资源包、状态联系表、动画预览与审查报告 | acceptance: 首张动态闸门先通过，四图分别验收，全部新增调用不超过十八次
- [ ] T-06 | A-06 | 验证 Ubuntu CPU 兼容与内存约束 | output: 隔离 Linux 检查脚本、峰值内存与耗时记录、回归报告 | acceptance: Ubuntu 无 GPU/桌面执行通过，进程组内存不超过 1.5 GiB，项目回归通过

## 发现与变更记录

- 2026-09-05 | 本轮结果：串行batch入口、幂等缓存、暂停非零退出、哈希校验预览汇总已实现。女性b5fd501d-a070-4eaf-8576-472838306b43完成12阶段，青年独立缓存回归完成12阶段；两者63帧遮罩外变化0、浏览器QA通过，视觉确认pending。修复闭眼配准及嘴部拓扑跨人物兼容问题；Node75/75、Python12/12、tsc及diff检查通过，安全复核无阻断。男性首请求ECONNRESET保持paused；第四图预检通过。累计调用14/18，若男性结果不可恢复，完成男性及第四图预计仍需9次尝试，总上限需23并明确手动重试授权；未提高额度。详见docs/batch-validation-2026-09-05.md。历史未完成项不伪报四图完成。

- 2026-09-05 | 用户再次要求完成批量化并用测试图实测；统一12阶段服务已在role-resource-pipeline任务完成，补全多文件串行CLI、旧规范图安全复用及预览汇总。男性新角色3142d97b-7932-479b-99fd-dd33205424eb通过预检/规范图复用/定位，首个嘴半素材请求5028ms ECONNRESET、无HTTP响应而暂停。女性独立样本继续首次调用。详情见docs/batch-validation-2026-09-05.md；本历史四图任务尚未验收，不把新代码或青年结果等同四图完成。

- 2026-09-05 | 回归与复核：npm test 59/59、Python unittest 7/7、npm run check、git diff --check通过；任务记录校验0错误0警告。review_motion_safety复核candidate/审计/激活链路，未发现剩余阻断问题。模板校验脚本scripts/validate_codex_template.py及模板tests目录不在当前应用仓库，未声称执行模板测试。
- 2026-09-05 | 恢复与明确重试授权：按用户“现在请进行重试…完成其余静态资源…动画素材”及已确认嘴部标准，青年使用独立 youth-v2 输出、显式 --approve-prompt-upgrade 和 --stream，保留所有历史调用与产物；没有自动重试。北京时间09:34:59至09:41:52四态全部成功；累计尝试9次，仍未提高18次总上限。本次流式成功不等于历史断流根因已证实。
- 2026-09-05 | T-02 | evidence: type=artifact; locator=AI_output/motion/youth-v2/resource-build-ksmanhpe/final-audit.json; result=四张真实独立donor已配准、可解码，嘴及左右眼各21帧共63帧；逐帧遮罩alpha相符且遮罩外改变像素为0。最终闭/半/开H/W为0.00348493/0.10662291/0.20984882，三档及区分度均通过；原始大开口0.3035仅本地校准，无追加生图。
- 2026-09-05 | A-03进展 | evidence: type=artifact; locator=AI_output/motion/youth-v2/resource-build-ksmanhpe/browser-qa.json; result=Edge浏览器嘴/左右眼独立参数改变像素11337/2597/2398且各自ROI外为0；自动动画、停止闭嘴、本地音频响度及静音通过，390px移动视口无横向溢出、无页面错误。离线HTML、100帧APNG和review.zip已生成。联系表已目视检查；自然度与手机真机尚待审查，不将功能测试等同用户效果批准。
- 2026-09-05 | 修复：补源/目标网格有限值、退化和翻转拒绝；嘴部局部相似配准与内唇幅度校准；静音去除残余牙缝；Canvas固定读取模式防止后端切换导致像素舍入差异。assemble只写candidate，final-audit嘴部不合格直接失败，finalize要求像素和浏览器QA均通过才更新current，visualReview仍pending。
- 2026-09-05 | 未完成边界：另外三个人物尚未生成，完整完成预计还需13次，累计22次（含历史失败）。已询问18增至22的预算调整，尚未获得答复，不能擅自修改预算。A04批任务HTTP/A05四图/A06Ubuntu22.04及进程组内存验收保持未完成。

- 2026-09-04 | 恢复执行：用户确认平台成功并要求继续。批处理仅将青年mouth-half缓存指向已成功replacement-3；缺失该账本则拒绝请求，保留所有失败记录。7项donor测试通过，review_motion_safety只读审查未发现新增重复付费路径。真实mouth-half稳定点配准中位误差0.659px，但尚未完成局部或动态验收。
- 2026-09-04 | 新阻塞：青年mouth-open于北京时间17:24:12.448发起，17:25:03.024报fetch failed (UND_ERR_SOCKET)，50.576秒；账本.calls/93ae4c0b3953e19d0a236ceb5acc7b1b8cd7dbb55b4a9192c0de4af1c90b976d.json保留failed-or-unknown，无图片/request ID。累计5次尝试仅1次本地成功；眼态未调用，不自动重试。等待平台记录核对/结果恢复或新的明确重试授权。完成四图目前预计至少21次（假定本次结果无法恢复），未提高18次上限。
- 2026-09-04 | 审查未解决风险：assemble.py mesh_warp仅检查目标三角形退化，缺少源三角形退化/翻转及有限值检查；真实闭眼素材可能触发错误贴图。进入真实资源验收前须修复并补回归，不能以蒙版外零差异代替视觉检查。

- 2026-09-04 | 用户同步观察平台日志并明确授权再调用一次。独立replacement-3（累计第4次）使用原模型/提示词/图片/非流式multipart，仅增加本地传输观测。北京时间17:12:31.514开始，17:12:31.706客户端bodySent，17:14:11.444收到HTTP200 application/json，17:14:18.177完成保存校验，共106.663秒。得到youth/donors/mouth-half.png，1024x1536，1941574字节，SHA256 43a4882a7531d9a1667bef69f1c9811e87ca5ef21fbfc5a70e0872292dc2733c。未返回request ID。前3次失败账本保留，未请求其他状态；A02仍未完整验收，批量任务保持暂停。此成功证明当前原请求格式能完成上传/生成/接收/解码，不等于历史故障根因已确定或连接已稳定。

- 2026-09-04 | 本次手动重试结果：北京时间16:50:14.936至16:50:19.990，5.054秒后fetch failed (ECONNRESET)。底层causeMessage为Client network socket disconnected before secure TLS connection was established；尚未取得HTTP响应头、request ID或图片。账本.calls/674a3f21bfb0095fcc53a8429a48aa515b0a589f66895b6fad37239dd5d74302-approved-replacement-2.json保留完整安全字段。仅调用一次，未再次尝试；A02仍未验收。

- 2026-09-04 | 独立手动重试授权：用户修改Clash规则后明确要求重试。仅再次调用青年mouth-half一次（replacement-2），不自动生成其他状态、不改模型/提示词/非流式协议、不提高18次总预算。此明确指令覆盖v2中该请求仅一次重试的限制；其余批量任务保持暂停，完成全批所需预算待后续核对。操作入口AI_output/motion/retry-after-clash.mjs，保留前两次记录。

- 2026-09-04 | v2执行：一次授权重试于15:39:40至15:40:39（Asia/Shanghai）发起，58.77秒后UND_ERR_SOCKET；账本保留-approved-replacement-1，未取得图片/request ID；总计两次失败或未知尝试，未调用其他状态。
- 2026-09-04 | 只读诊断：curl HEAD、Node GET默认、Node GET启用环境代理访问models均200。生图端长连接断开原因未定，不能归因于密钥或已证实的代理问题。
- 2026-09-04 | A02进展未验收：补CPU局部相似配准、独立半态相邻网格形变、21帧局部图集、原图遮罩保护、状态联系表。6项Python合成数据测试通过，但无真实donor，不能宣称视觉或任务通过。
- 2026-09-04 | 传输改进：按ZenMux官方文档补可选SSE读取，partial不能冒充completed，收到头部立即记录request ID。57项Node测试及tsc通过；流式尚未付费实测，默认未打开。
- 2026-09-04 | 二次只读审查：修正组装前遮罩重验证、按本图五官推导联系表裁剪、独立build目录及成功指针发布，失败不破坏旧资源。
- 2026-09-04 | 待新授权：已询问是否准许改流式额外一次尝试且总上限19；当前仍遵守已批18上限，不发第三次请求，A02未通过故不进入依赖步骤。

- 2026-09-04 | v2批准：用户明确授权重新尝试首个请求并继续任务；保留v1快照及首个失败记录，其他范围不变。

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
- 2026-09-04 | state: PAUSED -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-04 | state: IN_PROGRESS -> PAUSED | reason: 授权的一次重试仍被连接关闭；保留两条记录，流式再次尝试需新授权
- 2026-09-04 | state: PAUSED -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-04 | state: IN_PROGRESS -> PAUSED | reason: mouth-open连接断开且完成状态未知，等待平台核对或明确重试授权
- 2026-09-05 | state: PAUSED -> IN_PROGRESS | reason: 开始或恢复执行
- 2026-09-05 | state: IN_PROGRESS -> PAUSED | reason: 青年新版四态资源及动画已交付技术审查包；其余三人完整生成需总预算22次，高于已批18次，预算调整待答复；青年自然度待用户审查

## 完成标准

- 首图动态闸门通过后再扩展；四图逐项记录，不掩盖失败。
- 所有遮罩外像素零差异；输出资源可解码、参数独立、静音闭嘴。
- 实际新增付费调用不超过18次，不自动重试。
- Ubuntu无GPU无桌面实测进程组峰值不超过1.5 GiB；项目回归通过。无法实测则保持未完成。
