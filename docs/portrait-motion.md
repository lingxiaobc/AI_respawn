# 批量嘴眼资源（青年样本技术验收通过，四图批量尚未完成）

目标：规范图 → CPU关键点/紧贴遮罩 → ZenMux独立嘴半/开、眼半/闭素材 → 局部资源 → 浏览器动画。
当前已打通青年样本的四态真实素材生成、局部配准与幅度校准、63帧图集、交互预览及本地音频驱动。像素和浏览器技术验收通过；用户自然度审查、批任务HTTP、四图验收及目标Ubuntu22.04验证尚未完成。

## CPU环境

Python 3.10–3.12；Node 24。创建项目专用虚拟环境，不改系统Python。

```sh
python3 -m venv .venv-motion
.venv-motion/bin/python -m pip install -r scripts/portrait-motion/requirements.txt
.venv-motion/bin/python -m pip install --no-deps mediapipe==0.10.33
.venv-motion/bin/python scripts/portrait-motion/download_model.py
```

Windows将`.venv-motion/bin/python`替换为`.venv-motion/Scripts/python.exe`。
MediaPipe单独以`--no-deps`安装，因为其元数据声明带GUI的OpenCV；本项目使用headless版，不能同时安装两份cv2包。
模型来自[Google Face Landmarker文档](https://developers.google.cn/edge/mediapipe/solutions/vision/face_landmarker/index)，下载后校验固定SHA-256。运行定位不联网、不使用GPU。

```sh
.venv-motion/bin/python scripts/portrait-motion/prepare.py <canonical.png> AI_output/motion/<name>
```

输入固定1024×1536、全不透明、一个可检测正脸。输出完整底图原始字节、478点、逐图嘴眼ROI、三张灰度遮罩、联合遮罩、检查图、源/像素/模型哈希。左右眼名称采用观看者视角。
遮罩按五官几何比例计算，不复制旧人物坐标。定位不等于视觉自然度验收。

## 付费入口与失败行为

只有明确授权后才能执行：

```sh
node --experimental-strip-types scripts/motion-donors.ts AI_output/motion/<name>
```

读取未跟踪的`.env`中的`ZENMUX_API_KEY`和可选`ZENMUX_BASE_URL`；延用项目ZenMux images/edits接口。
每个素材一请求一结果，默认依次执行四态；不生成额外候选。

- `AI_output/motion/.calls/`是全批18次尝试预算账本（用户2026-09-04批准v2），包含保守计数的失败/未知尝试。
- 每次请求前用排他文件创建并fsync落账，进程锁避免CLI相互竞态。
- 只有成功状态且文件哈希吻合才复用；失败、未知、缺图、损坏均阻止再次请求。
- 崩溃遗留`.paid-call-lock`会阻塞后续执行，不能自动删除锁绕过；先核对供应商记录和账本。
- 不要删除`.calls`、修改来源哈希或换输出根来绕过预算/重试限制。
- 原始donor和提示词保留作为证据，不直接作为动画整图。
- 超过18次或失败后新尝试需要新授权。历史逐次重试授权及失败记录均保留；`--approve-prompt-upgrade`只用于用户明确批准的新提示词版本，不允许同版本失败重试，也不会提高总预算。没有通用force/retry入口。

## 当前证据与阻塞

三张已有规范图的CPU定位通过，单张核心定位耗时约0.438–1.047秒（Windows本机，不是服务器）。
历史请求中有TLS建立前断开和生成等待期间`UND_ERR_SOCKET`，也有一次旧提示词非流式成功，具体记录在`.calls`和任务记录中。不能用后来的成功倒推历史故障根因。
2026-09-05，经用户授权，以新嘴部标准和`--stream`生成青年四态，4/4成功；当前累计尝试9次（包括历史失败/未知），总上限仍18。完成另外三人预计还需13次，总计22，预算调整尚待答复。
按[ZenMux流式图片编辑事件文档](https://zenmux.ai/docs/api/openai/image-edit-streaming-events.html)实现可选stream支持；默认仍关闭。仅最终completed事件计作成功，partial不落成品；流中断/错误仍失败不重试。收到响应头即记request ID。本次四次流式成功不是历史连接问题已彻底修复的证据。
本机WSL是Ubuntu24.04；目标Ubuntu22.04、CPU整条链和1.5 GiB峰值均尚未验收。

验证覆盖密钥回显脱敏、损坏缓存拒绝、无自动重试、SSE截断拒绝、网格恒等、退化/翻转/非有限坐标拒绝与遮罩外像素保护；真实产物另做像素、嘴部测量和浏览器验证。
预算账本目前仅接入donor请求；A05执行新增规范化之前必须接入同一账本，现有独立normalize:batch命令不可用于绕过本阶段总上限。

青年原始规范图有轻微露齿；当前已在嘴部遮罩内闭合并避免残余牙缝，原始底图文件保持不变。

## 局部组装、验收和导出

```sh
.venv-motion/bin/python scripts/portrait-motion/assemble.py AI_output/motion/<name>
.venv-motion/bin/python scripts/portrait-motion/audit_resource.py AI_output/motion/<name>
.venv-motion/bin/python scripts/portrait-motion/export_preview.py AI_output/motion/<name>
```

先重验底图/模型/逐图遮罩，再配准四个donor。半态为独立素材，邻接状态先网格形变后混合，生成嘴/观看者左右眼各21帧图集及manifest。
每次写新`resource-build-*`目录和`resource-candidate.json`，不会自动激活。失败保留现场，不覆盖旧资源。`audit_resource.py`逐帧验证遮罩，检测最终合成图的嘴部比例；不合格直接失败。

导出得到自包含`preview.html`和100帧无损APNG `motion-preview.png`。用本地HTTP服务打开预览；`verify-preview.mjs <URL> <resource目录>`通过Playwright/Edge验证独立参数、自动动画、本地音频、静音及390px视口，并写`browser-qa.json`。Playwright可通过`PLAYWRIGHT_MODULE`指向已安装模块。

```sh
.venv-motion/bin/python scripts/portrait-motion/finalize_resource.py AI_output/motion/<name>
```

仅像素/嘴部审计和浏览器QA都通过才更新`resource-current.json`并生成`*-review.zip`；指针标记`technicalReview: passed`和`visualReview: pending`，不代表用户自然度批准或生产发布。ZIP含底图、三张图集、manifest、预览及验收报告。

当前青年结果：`AI_output/motion/youth-v2/resource-build-ksmanhpe`。最终闭/半/开内唇高度÷原始嘴宽为0.00348/0.10662/0.20985；半开要求0.08–0.12，最大要求0.20–0.24。63帧遮罩外改变像素为0。浏览器三参数独立、自动动画、音频驱动和静音均通过；移动端仅做视口模拟，未冒充真机测试。嘴部中间态使用局部变形和插值，仍应通过预览审查自然度。
