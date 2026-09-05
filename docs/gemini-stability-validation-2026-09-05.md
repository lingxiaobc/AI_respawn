# Gemini 全新角色稳定性验证（2026-09-05）

> 2026-09-06勘误：本文保留当日结果。90多岁男性被旧原图定位门槛拦截，不足以判断其标准图不合格；现已修正流程并确认该原图基础检查通过，标准图及动画仍未生成。详见[门禁修正记录](canonical-gate-fix-2026-09-06.md)。

## 结论与统计边界

本轮接续用户批准的PT-new-role-stability v1；模型切换和额外一次预算分别在执行快照v3/v4记录。**5个新增输入均有结论，3个角色通过动画技术检查，达到至少3个的数量目标；另有1个请求中断和1个预检拒绝，不能宣称所有输入均成功。** 人物身份、自然度和流畅度仍由用户确认。最终冻结版本及Ubuntu验收以`AI_output/gemini-stability-review/evidence.json`为准。

本轮新增17次Gemini请求，16次图片成功接收并落盘、1次响应头前连接中断；不包括此前4次Gemini探测。累计账本37/40，含历史失败，不等于平台收费次数。本轮没有请求GPT、没有自动重试付费失败，也没有修改密钥。根目录.env仍为配置唯一来源，结束时ROLE_ALLOW_PAID=0。

| 输入（文件名仅为测试标识） | 首次结果 | 修复/最终结果 |
| --- | --- | --- |
| 40多岁男性.png | 本轮5次Gemini及12阶段通过；更早GPT失败另保留 | 最新版缓存回归12阶段通过 |
| 50多岁女性.png | 5次生图通过，嘴部局部位移超阈值 | 通用配准修复后12阶段通过，无重新生图 |
| 50多岁男性侧身.png | 5次生图通过，嘴网格/右眼配准依次触发拒绝 | 通用搜索及逐轨道配准修复后12阶段通过，无重新生图 |
| 50多岁，女性侧身.png | 规范图成功，半张嘴请求中断 | 暂停，未请求余下三态 |
| 90多岁男性.png | 原图未检测出唯一可定位人脸 | 预检拒绝，无付费调用；不声称照片实际没有人脸 |

以4个通过预检并进入生成的新增角色为分母，本轮首次完整流程1/4，通用修复后3/4；输入拒绝1/5单列。不能把16/17生图成功率写成动画成功率，也不能把旧人物回归算作新增成功角色。

## 最新可审查角色

- 男性：`AI_output/stability-v1/roles/2f9d4227-c5a9-4b81-a8e1-0cf412dc2b57/resource-build-gmv8shno/`。
- 女性：`AI_output/stability-v1/roles/9a14c57f-8058-4a7f-ab5f-fe122fb9826a/resource-build-04ajyhsp/`。
- 上述是中间版本的可用证据；最新冻结版本Windows指纹为`696215e4efbfb8dc3419e829ad7c276175e1aca41c7977802dee9e3780db855a`。最新角色ID、资源、哈希复查及全部审计数据由`evidence.json`逐项记录。
- 第三位男性最新成功：`AI_output/stability-v1/roles/f210b636-4fbd-465a-8493-ec0c33ceaeeb/resource-build-meybv9h1/`。
- 最新同版首位男性ID为`35279795-f547-420f-bd99-bf060d6ab06c`，女性ID为`33588868-4594-46a1-be61-452fa42d46c8`；审查入口`AI_output/gemini-stability-review/latest.html`，汇总复查`technicalTargetMet=true`。
- 男性闭/半/开嘴比约0.0051/0.1089/0.2118；女性约0.0071/0.1195/0.2100。两者63帧遮罩外变化0，四项嘴幅度门禁通过；浏览器独立参数区域外变化0、音量驱动/静音闭嘴通过、无JS错误。
- 原始首次成功/失败角色保留，新的缓存回归不覆盖它们。`AI_output/gemini-stability-review/`提供独立HTML预览及历史结果。

## 通用代码修复与证据

### Gemini直连及缓存安全

`PaidImages`在根.env的`ZENMUX_IMAGE_MODEL=google/gemini-3-pro-image`时直接走Gemini，不先产生GPT失败请求。复用原Vertex协议、独立模型账本与共享40次总上限，失败/未知记录禁止重入付费。

复核发现直连早返回可能绕过旧规范图缓存，已在付费前补同一个`normalizedCache`校验；有效历史规范图零调用返回，损坏缓存拒绝且零调用。模型切换不应隐式重新购买已有合格规范图。新增测试覆盖直连无GPT及历史缓存保护。

### 女性局部位移误差

原角色`8018680c-6028-4f92-b836-584f83955e7d`暂停于assemble，错误`mouth: donor local displacement too large`。定位在`assemble.py/local_donor`嘴角均值位移门禁：半张嘴RANSAC配准后19.0669px，原阈值18.9270px（嘴宽×0.12）。同素材大张嘴位移11.4491px，没有超限。

使用排除嘴眼区域的稳定脸部纹理独立ECC配准，相关度0.98229，嘴角位移降至14.8644px。根因证据指向表情相关关键点漂移导致的配准偏差；不是图片传输失败。改动只在关键点配准将触发原嘴位移门禁时尝试既有纹理配准，仍保留相关度>=0.97、平移<=10px、角度<=0.05及后续原嘴眼位移/宽度/角度检查。未扩大遮罩或放宽阈值。

缓存复现角色`8d790b24-6912-4a31-836b-d40c1c17d725`及最新版live缓存提交均12阶段通过。新旧四位角色全部回归：旧青年`AI_output/stability-v1/gemini-final/youth/replay-report.json`、旧女性`gemini-final/female/replay-report.json`。独立只读复核确认未绕过安全门禁。

### 已修复：侧身男性嘴部网格及眼轨道配准

角色`fb570bce-c9d2-4041-ab0c-57126094033e`暂停于assemble，错误：`mouth: No non-flipping triangulation for adjacent animation states`。5张原始生成图和账本均成功；失败发生在`morph_frames/compatible_topology`，原5个拓扑候选未通过相邻状态21个采样位置的三角形面积/方向检查。

进一步只读内存诊断发现候选搜索遗漏：完整40点无解，但稀疏24点在blend=0.04–0.18有安全解；原5个候选恰好跳过。稀疏blend=.5的三角形[15,2,13]面积跨-8.17至448.75，blend=.05则全21个实际帧安全。已仅扩充确定性候选搜索为实际21帧网格，保留原面积>=.05和符号检查；新增窄安全窗口/真正无解测试，14项Python测试通过。无付费重建`1daec5d1-9de6-4e2b-a987-783e29f16f6b`嘴部已过，随后在`eyeRight: donor local displacement too large`暂停，不能因嘴部修复就宣称该角色通过。原所有失败目录保留。

眼轨道进一步诊断：闭眼素材RANSAC左眼位移6.476px、右眼10.0452px；ECC左眼11.8135px、右眼8.509px，原阈值均10px。直接全局切ECC仍会让左眼失败，因此没有采用该方案。实际修复仅在某局部轨道明确位移超限时，尝试已通过原稳定纹理门禁的ECC候选，并再次调用同一个local_donor执行全部原位移、宽度、角度及色差检查；候选只影响当前轨道，不改变另一只眼。原遮罩和输出审计不变，新增轨道Registration记录成功候选。第三位男性最终12阶段通过。独立复核未发现安全阻断；逐轨道fallback目前有真实样本集成回归，但尚缺针对该分支每条错误路径的独立单元测试，作为残余测试覆盖限制记录。

### 尚未解决：侧身女性连接中断

角色`14d9350a-002e-4e72-a57d-d24a723a0e8d`。normalize已成功（37223ms），locate通过；mouth-half于40494ms失败：

```text
[model=google/gemini-3-pro-image stage=request-awaiting-headers http=none elapsedMs=40494] UND_ERR_SOCKET fetch failed
```

账本`AI_output/motion/.calls/cd12fcde42f71aa48f489389460dda2bbcc9ed9611b6244581e16c532969b951.json`；北京时间2026-09-05 23:45:20.979至23:46:01.476。phase=request，无HTTP头或requestId；规范图源哈希`d12a7195d028212bf52107e97589916b871f64918aeb1855e8609b46ae0d5dd4`。请求经过已授权沙箱外执行，不能把本次错误称为EACCES或403权限问题；责任方、平台是否完成生成和是否收费仍未知，需平台同时间日志核对。未擅自重发。

## Ubuntu及网页验证

使用现有本机WSL Ubuntu24.04，不是腾讯云部署。当前隔离副本`AI_output/stability-linux/work`，复用既有私有Linux依赖和系统库，不修改系统网络/生产环境；副本根.env仅含禁付费及本地运行路径，无凭据。使用两位新角色真实生成的缓存，CPU重新执行12阶段及浏览器检查。

| 最新版Ubuntu缓存重建 | 耗时 | 进程树RSS采样峰值 | 结果 |
| --- | --- | --- | --- |
| 首位男性 | 44.413s | 1050775552字节，约0.979GiB | 12阶段待人审，内存低于1.5GiB |
| 女性 | 39.616s | 1044508672字节，约0.973GiB | 12阶段待人审，内存低于1.5GiB |

证据：`AI_output/stability-linux/{first-final,woman-final}-memory.json`及对应目录`replay-report.json`。100ms采样累加父/子进程RSS，可能漏短时尖峰或重复统计共享页。不能用本机16核耗时承诺腾讯云4核耗时。首轮修复前男性报告`first-memory.json`也保留。

上述为中间修复版记录，最终冻结代码又对三个成功新角色全量复验：`man-verified`55.967s/1049833472字节，`woman-verified`43.390s/1058402304字节，`side-man-verified`38.417s/1073156096字节，全部exitCode=0、12阶段awaiting_review、内存通过。对应`*-memory.json`与目录`replay-report.json`为最终证据，峰值均约0.98–1.00GiB。

网页上传验证：`node scripts/verify-role-admin.mjs "image/40多岁男性.png"`，根.env设禁付费且非fixture；实际上传原图后走共享后端、校验并复用已生成图片。报告`AI_output/role-ui-test/gemini-stability/ui-qa/report.json`；上传、12阶段、预览、刷新恢复、不通过备注持久化、390px无横向溢出和无JS异常均通过。截图已目视检查中文正常。测试中的rejected为自动化动作，备注明确“不代表用户审查”。临时测试token/端口配置已移除。

最终冻结版重复网页验证也通过，证据在`AI_output/role-ui-test/gemini-stability-final/ui-qa/report.json`，汇总报告使用这份最终记录。本机预览端口8890被Windows以WinError10013拒绝；改为系统分配的空闲回环端口10293后服务启动，非生图请求失败。

验证：96项Node测试、14项Python测试、TypeScript检查通过；未宣称模板验证器或根tests目录存在。用户实际自然度审查尚未执行，本轮没有提交、推送或部署。最终新旧角色同版回归在`gemini-verified/{youth,female}`及roles最新任务中。

## 后续边界

已完成3位新角色制作和全部5图结论；第四位网络失败仍保留。当前仅余3次预算，侧身女性缺半张嘴及另外三态，若无平台可恢复的半张嘴结果，需明确一次重试授权及至少额外1次额度（累计41）才足以继续其完整资源。应先核对平台记录，不能先重发再查。达到本计划至少3个通过的验收目标不等于这位失败角色已恢复，也不等于生产稳定性得到统计证明。
