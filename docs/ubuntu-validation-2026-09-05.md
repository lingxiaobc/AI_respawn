# 现有 Ubuntu 隔离验证记录（2026-09-05）

## 范围与环境

用户批准使用现有 Ubuntu，不再以 Ubuntu 22.04 镜像作为本轮前提。本轮使用本机 WSL Ubuntu 24.04.4、内核 6.18.33.2-microsoft-standard-WSL2、x86_64、Node 24.14.0、Python 3.12.3、16 个逻辑 CPU；不是腾讯云生产机器，不可据此承诺目标 4 核机器的处理耗时。

采用原青年上传图和已成功生成的规范图、四态供体缓存。规范化和供体生成阶段执行哈希校验与复用，不发新请求；预检、定位、组装、63 帧审计、导出和浏览器检查在 Linux 重新执行。没有验证本轮 ZenMux 实时网络链路，也没有用新人物新增付费生成。历史 `.calls` 仍为 9 条。

代码副本位于 `AI_output/linux-validation/work`，依赖、系统库、字体和浏览器均放在其父级隔离目录。没有复制 `.env`、原 node_modules 或历史调用账本；测试子进程用环境白名单启动。未更改系统 DNS、代理、Python、字体或生产服务。

## 实际发现和处置

1. **WSL DNS 不可用**：之前官方容器仓库解析失败。因此从 Windows 下载官方 Linux 依赖，再离线用于 WSL；不是重试 ZenMux，也没有修改网络配置。
2. **`ensurepip is not available`**：现有 Ubuntu 未装 venv 配套包。用 `python3 -m venv --without-pip` 建立项目私有环境，再以下载的 pip wheel 离线安装，不改系统 Python。
3. **`EBADPLATFORM`**：Windows npm 拒绝显式 Linux canvas 包。仅在独立依赖目录使用 `--force --ignore-scripts` 下载；Linux 实际加载与 Node 测试通过，不更改原项目依赖。
4. **浏览器跨平台下载后的 `winldd` 检查失败**：Chromium 和 FFmpeg 已下载完成，失败发生在 Windows 对 Linux 文件执行宿主依赖检查的步骤。随后在 Ubuntu 用 `ldd` 检查，发现缺少 NSS/NSPR/ALSA，下载官方 `.deb` 并只解压到私有 `sysroot`。
5. **原图预检失败 `OSError: libGLESv2.so.2: cannot open shared object file`**：实际定位点为 MediaPipe `FaceLandmarker.create_from_options` → `mediapipe_c_bindings.load_raw_library` → `ctypes.CDLL`。单纯 `import mediapipe` 和单元测试通过，不代表实际模型共享库可加载。补齐 `libgles2`/`libglvnd0` 后实际 CPU 预检和定位通过；这不是要求 GPU 推理。失败角色保留为 paused，未进入后续付费阶段。
6. **中文截图为方框**：DOM、交互、无横向溢出测试通过仍不能证明字形正常。人工查看 `mobile.png` 发现缺中文字体，隔离安装 Noto CJK 并用私有 fontconfig 配置后复查。Docker 准备文件也补充 `libgles2` 和 `fonts-noto-cjk`，但该 Dockerfile 本轮未构建验证。

第一轮缺 GLES 的失败报告保留在 `AI_output/linux-validation/failed-missing-gles-memory.json`；其 `exitCode=1`，即使 `memoryPassed=true` 也不是成功验收。相应失败角色 `b8ed40a4-be64-4eac-9672-03e2bf8b03eb` 保留，不覆盖。

## 自动验证及证据

- Ubuntu `npm test`：74/74 通过。
- Ubuntu `../venv/bin/python -m unittest discover -s scripts/portrait-motion -p 'test_*.py'`：11/11 通过。
- Windows `npm run check`：类型检查通过；`git diff --check` 通过。
- 模板约定的 `scripts/validate_codex_template.py` 与根 `tests/` 在当前仓库不存在，命令已尝试并失败，不能写成模板验证通过；本项目实际 Python 测试在上述 portrait-motion 目录。
- 独立只读审查确认隔离复制、凭据白名单和 Ubuntu 环境记录无阻断。
- `AI_output/linux-validation/environment.json`：实际系统和运行时记录。
- `AI_output/linux-validation/work/AI_output/role-ui-qa/report.json`：上传、完整流水线、预览、刷新恢复、不通过备注和 390×844 视口检查。
- `AI_output/linux-validation/linux-ui-memory.json`：含模拟管理员浏览器的完整 UI 流程。补中文字体后功能通过，总耗时 45.995 秒，峰值 1,751,535,616 字节（约 1.631 GiB），**超过 1.5 GiB**。该记录不作为后台内存通过证据，保留超标事实。
- `AI_output/linux-validation/linux-worker-memory.json`：实际后台 worker 及全部后代（含动画检查浏览器，不含模拟客户端浏览器），43.331 秒，峰值 1,011,118,080 字节（约 0.942 GiB），低于 1.5 GiB；退出码 0。采样周期 100ms，可能遗漏短时尖峰，RSS 相加也可能重复统计共享页。
- `AI_output/linux-validation/worker-validation.json`：worker 的唯一角色 `d6b2ec12-6dfb-46f3-b1a3-7a2ff1961c55` 完成精确的 12 阶段并处于 awaiting_review，`passed=true`；不是只看 CLI 退出码。资源目录 `AI_output/linux-validation/work/AI_output/role-worker-test/1788609734194724053/d6b2ec12-6dfb-46f3-b1a3-7a2ff1961c55/resource-build-yrzcj_bb`。

补字体后的 `mobile.png` 已人工查看，中文显示正常，390px 页面完整且无横向溢出。UI 测试角色 `e96691e4-8c36-46f3-b225-e2d8db94ac80` 的 rejected 仅是自动化验证，不影响上述待用户审查的 worker 角色。服务器实际承载 worker，而模拟管理员浏览器相当于客户端，两种内存边界不可混称；生产也不应在这台小内存服务器同时跑整套 UI 自动化。

补字体之前的完整成功回放：角色 `9822a7f7-b10e-415d-91d3-2e88263f581a`，12 阶段完成后先进入 awaiting_review，然后自动测试选择 rejected 并写明“不代表用户审查”，不是用户否决了素材。总耗时 48.386 秒、进程树峰值 1,580,310,528 字节（约 1.472 GiB），距离 1.5 GiB 上限约 29 MiB。该记录保留在 `passed-before-fonts-memory.json`。

同次资源 `resource-build-01j90pfp/final-audit.json`：63 帧，遮罩外变化 0；闭/半/开嘴相对开口比约 0.00349/0.10686/0.20976，分离度检查通过。`browser-qa.json`：三个参数各自区域外变化均 0，音量驱动及静音闭嘴通过，页面 JS 错误为空。视觉自然程度仍须用户审查；移动视口不是手机真机。

## 复现方式与依赖清单

Windows 执行 `powershell -NoProfile -File scripts/role-linux/prepare-validation.ps1` 建立一次性白名单副本；若目录存在则停止保留，不能覆盖已有证据。将 Linux 依赖安装到 `AI_output/linux-validation/node` 和 `venv`，并在 `work/node_modules` 链接前者；模型及缓存由准备脚本复制。

本次 Python 使用锁定的 `scripts/portrait-motion/requirements.txt`，另装 `mediapipe==0.10.33 --no-deps`；Playwright 1.62.1、Chromium Headless Shell v1234、canvas 1.0.8/Linux GNU 二进制。运行库来自 Ubuntu 官方 archive：NSPR 4.35-1.1build1、NSS 3.98-1ubuntu0.2、ALSA 1.2.11-1ubuntu0.4、GLES/GLVND 1.7.0-1build1、Noto CJK 20230817+repack1-3。系统库使用 `dpkg-deb -x <包> sysroot` 解压，不使用 `dpkg -i` 改系统。字体配置从 `scripts/role-linux/fonts.conf` 复制到隔离目录。

在 Ubuntu 中进入副本，运行：

```sh
cd /mnt/p/codex_project/AI_respawn/AI_output/linux-validation/work
sh scripts/role-linux/run-validation.sh worker
# 可选的 UI 自动化，含额外模拟客户端浏览器；本次其功能通过但总内存超标：
sh scripts/role-linux/run-validation.sh ui
```

该脚本记录实际 Ubuntu 环境，强制缓存回放和零付费，分别保存 worker/UI 的进程树测量。worker 模式还核查角色待审查状态及阶段数，内存超标或流水线暂停都不会标记通过。再次执行会新建测试角色；UI 输出中的 rejected 为自动化交互测试，不代表用户验收。准备目录及依赖需预先存在；脚本不是联网安装器。

## 交付边界

本轮验证的是 CPU-only Linux 功能兼容和缓存流水线，不是生产部署或新图片成功率保证。小内存机器应保持单 worker，不并行构建；目标服务器仍须上线前实测可用内存与磁盘。中文字体、实际 CPU 模型加载、图像内容审计和人工截图检查均须保留，不能仅凭测试退出码或 `memoryPassed` 宣称所有效果通过。
