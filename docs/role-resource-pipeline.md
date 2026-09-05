# 单角色自动资源流水线

## 本次交付与证据边界

输入一张图、对应一个角色。后台依次执行：原图本地检查 → ZenMux规范化 → CPU五官定位/小范围遮罩 → 四态素材 → 配准及63帧局部动画 → 像素和口型审计 → HTML/APNG → 浏览器检查 → ZIP → 等待用户审查。

当前已在Windows完成青年原始上传图的**缓存回放**：规范化和四态生图用已有真实结果替代远程请求；之后重新运行定位、组装、审计、浏览器和打包。没有新付费调用，不等于新增一次平台成功，也不代表其他人物完整通过。

- CLI产物：`AI_output/role-replay-test/af8d3c57-bd14-40e4-b752-e3b8f62165e3/job.json`，12阶段完成，状态awaiting_review。
- UI证据：`AI_output/role-ui-qa/report.json`，单图提交、完整流程、动画预览、刷新恢复、不通过+备注和390px视口检查通过。自动测试的“拒绝”不代表用户的效果判断。
- Windows整组RSS测量：`AI_output/role-ui-qa/windows-memory.json`；首次UI验证27秒，采样峰值1,540,194,304字节（约1.434GiB，含外层测试浏览器和服务后代）。采样100ms可能遗漏短峰，不是Ubuntu实测。
- Ubuntu22.04尚未验收：本机WSL是24.04；有权限使用本机Docker，但构建在拉取基础镜像时失败。错误为镜像源`docker.m.daocloud.io`在`127.0.0.53`解析失败；进一步解析`registry-1.docker.io`也返回`Temporary failure in name resolution`。未改本机DNS/代理/Docker配置，更未访问生产服务器。

## 启动

在项目根目录使用Node24及项目Python虚拟环境。先按`docs/portrait-motion.md`安装CPU依赖和FaceLandmarker模型。浏览器检查需要Playwright及对应浏览器；Linux默认Chromium，Windows可设置`PLAYWRIGHT_CHANNEL=msedge`。

在本机未跟踪的`.env`中配置`ROLE_ADMIN_TOKEN`为自行选择的至少16字符随机凭据，不要提交或粘贴进日志。页面需输入此凭据；不会写入localStorage/sessionStorage。不是完整账号系统。

```sh
npm run roles -- serve
```

默认访问`http://127.0.0.1:8878`。仅绑定loopback，不直接开放公网。角色服务与豆包通话服务独立，不需要豆包连接就能运行。旧规范化页面仍仅规范化，不应把它当作角色全流水线入口。

| 配置 | 默认/作用 |
| --- | --- |
| ROLE_ALLOW_PAID | 0；禁止任何新生图，本轮必须保持0 |
| ROLE_REPLAY_YOUTH | 0；设为1启用明确标记的青年缓存回放，仅接受其记录的原始输入 |
| ROLE_OUTPUT_DIR | AI_output/roles；角色隔离存储 |
| ROLE_ADMIN_TOKEN | 无默认值；不足16字符拒绝启动管理服务 |
| ROLE_PORT | 8878 |
| MOTION_PYTHON | Windows项目.venv-motion/Scripts/python.exe，Linux项目.venv-motion/bin/python；可指定绝对路径 |
| PLAYWRIGHT_CHANNEL | 空值使用Chromium；Windows可选msedge |
| PLAYWRIGHT_MODULE | 可选指定已安装Playwright模块绝对路径，正常安装时无需设置 |

`ROLE_ALLOW_PAID=1`是运行时开关，不是用户预算授权。真正开始付费前仍需用户批准范围/预算；开发默认0，即使`.env`有ZenMux密钥也不会自动生成。

## 无付费回放与CLI

PowerShell示例（覆盖本次进程环境，不改.env）：

```powershell
$env:ROLE_ALLOW_PAID='0'
$env:ROLE_REPLAY_YOUTH='1'
$env:ROLE_OUTPUT_DIR='AI_output/role-replay-test'
$env:PLAYWRIGHT_CHANNEL='msedge'
npm run roles -- submit AI_output/normalized/青年-cf1a11df052a/source.png
```

Linux对应使用`export`设置变量，不设置msedge。回放固定使用已有青年输入、规范图和四态素材，记录mode=fixture；输入不匹配会拒绝，不能把任意新人物套上青年结果。

```sh
npm run roles -- list
npm run roles -- resume <role-id>
```

CLI与HTTP共享writer锁；服务在运行时，另一个CLI写入进程会拒绝启动。CLI输出角色ID和阶段记录，不输出访问凭据。HTTP提供任务列表和详情，重复提交相同幂等键复用同一任务；相同图片使用不同提交键可以创建独立角色，审查状态不共享。

## 状态、恢复与数据保护

- 状态：queued → running → awaiting_review → approved/rejected；任何阶段异常转paused。
- 每阶段保存输出文件哈希和耗时，继续前验证全部已完成检查点。缓存缺失或修改会停止，不用自动重新生成掩盖损坏。
- 新角色先写完整临时目录再发布；Windows对正在被读取的job.json可能短暂拒绝原子替换，最多做5次短延迟的本地rename重试（不重发网络请求）。持续拒绝则报错并保留现场。
- 四态生成与规范化共享`AI_output/motion/.calls`及18次历史批准上限；9条历史尝试保留。旧规范化入口也接入该账本，旧donor CLI默认禁付费。
- 请求预留先落盘，失败/完成未知保守计入预算，不自动重试；新提示词遇到同源同状态旧调用要求明确核对，不能换提示词绕过失败记录。
- 暂停后“继续”仅恢复调度，不等于允许再次付费；未知调用仍会被账本拦截。技术通过只形成待审查资源，不自动批准。
- 审查绑定资源哈希；文件被修改或版本不匹配时拒绝审批。备注以文本渲染，不执行HTML。
- 角色检查点使用相对路径，读取时兼容旧Windows分隔符。历史付费账本的绝对输出路径不自动重写；迁移旧缓存到Linux时必须核对文件哈希和映射，路径缺失默认停止而非重新付费生成。
- ZIP先写唯一临时文件并同步，再原子发布ZIP，最后发布current；ZIP已完成但checkpoint未保存时可校验复用。已有ZIP内容不符时拒绝覆盖。
- `.worker.lock`及`.paid-call-lock`在异常强杀后可能保留，这是保守安全策略，不自动清除。先确认关联进程确实退出，备份角色job、调用账本和输出，核对平台是否已经执行，再由管理员处理**明确目标锁文件/锁目录**；不提供“一键强制重试”。普通重启已完成阶段可复用，原running任务会转paused。
- 如本地任务需要修复源文件或重新生成，保留原角色产物，新建角色/版本并重新审批，不把新资源自动继承为已通过。

## 本地质量检查不是准确率保证

原图检查使用本地CPU模型和代码：尺寸、一个可检测人脸、必要坐标在画布内、眼线倾斜、嘴在眼睛下方、对齐关系及人脸清晰度。清晰度用统一256px脸区的Laplacian方差，初始阈值15；倾斜阈值0.25弧度。三张规范图已通过，但这些是可调启发阈值，不代表遮挡/身份变化都能自动识别。

定位后继续检查五官区域大小、运动遮罩越界/重叠和配准异常；任何失败暂停该角色。最终检查63帧遮罩外像素零变化、闭/半/开嘴幅度、三个参数独立、音量驱动及静音闭嘴；流畅自然和接缝仍由用户确认。

## 测试

```sh
npm test
npm run check
.venv-motion/bin/python -m unittest discover -s scripts/portrait-motion -p 'test_*.py'
npm run roles:ui-test
```

Windows替换Python路径。UI测试仅回放已有结果，临时随机管理员凭据留在进程内；专用测试输出放在`AI_output/role-ui-test`，不修改用户的青年审查结论。

ZenMux响应误报的10项故障注入已加入`packages/image-normalization/response-errors.test.ts`，由npm test运行；此前复盘中“仅命令行验证”的描述是当时状态，现在已补为自动回归。

## Ubuntu隔离验收准备

`scripts/role-linux/Dockerfile`固定Ubuntu22.04、Node24及Python依赖；根`.dockerignore`采取白名单，构建上下文不包含.env、照片、账本或用户输出。镜像构建需要下载依赖和浏览器，不调用生图。

```sh
docker build -t ai-respawn-role-test:local -f scripts/role-linux/Dockerfile .
```

构建后应仅挂载必要代码目录、模型和回放输入为只读，单独挂载输出目录；不挂载.env或Docker socket。使用`measure_process.py --report <report.json> -- node --experimental-strip-types scripts/role-resources.ts submit <input>`测量父进程及全部后代RSS。完整本地链路和headless浏览器都要计入；目标峰值≤1.5GiB。用户已批准本轮改用现有WSL Ubuntu24.04验证，不再等待22.04镜像。实际结果、环境依赖故障与证据见[Ubuntu验证记录](ubuntu-validation-2026-09-05.md)；Dockerfile本身仍未构建验收。

生产上线前还需用户授权部署、反向代理/TLS、访问控制、备份和磁盘空间策略，本轮不执行。
