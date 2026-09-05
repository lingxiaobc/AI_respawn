# Gemini 图片回退与两次实测

## 授权与范围

用户明确要求：GPT-image2请求错误时回退至google/gemini-3-pro-image，并用该模型测试两次资源生成。本轮只发两次Gemini生成请求，没有额外GPT调用、没有第三次重试。该授权新增跨模型回退策略，覆盖之前禁止自动换模型的边界；同一Gemini尝试失败后仍暂停，不无限循环。

## 接口与实现

采用ZenMux官方Vertex AI协议，POST `/api/vertex-ai/v1/publishers/google/models/gemini-3-pro-image:generateContent`，不是替换OpenAI `/images/edits`的模型名。

文档依据：[Generate Content](https://zenmux.ai/docs/api/vertexai/generate-content.html)、[图片生成](https://zenmux.ai/docs/guide/advanced/image-generation.html)。发送Bearer认证、JSON contents中提示词和PNG inlineData参考图；candidateCount=1、TEXT/IMAGE、2:3、2K。不更改模型为preview别名。

- `packages/image-normalization/src/gemini.ts`：独立协议适配，正常完成的单个最终图像才可接受；拒绝纯文本、思考图、多图和异常完成状态。
- `packages/role-resource/src/gemini-images.ts`：按模型+源哈希+提示词版本+状态单独记账，调用前预留，成功缓存校验，失败/未知禁止自动重发；沿用39次共享上限。保存原始结果及1024x1536 PNG；只允许接近2:3的输出转换，不裁剪，不把转换后尺寸冒充模型原生尺寸。
- `PaidImages`：已记录的GPT网络/响应阶段失败最多切换一次Gemini；磁盘、缓存或图片校验问题不发另一笔请求。GPT原失败保留，不伪装GPT成功；Gemini失败后停止。重复运行成功项复用缓存。
- 根.env新增 `ZENMUX_IMAGE_FALLBACK=google/gemini-3-pro-image`、`ZENMUX_GEMINI_BASE_URL=https://zenmux.ai/api/vertex-ai`。密钥仍仅从根.env读取。测试后ROLE_ALLOW_PAID恢复0，回退配置保留。

## 两次实际结果

参考图：`AI_output/motion/youth-v2/static_locked_base.png`，调用前已目视检查；两次都是同一青年规范图的局部资源编辑。提示词复用当前项目嘴部/眼皮标准，没有让模型自行决定测试目标。

| 请求 | 北京时间开始 | 请求耗时 | 结果 |
| --- | --- | --- | --- |
| mouth-open 大张嘴 | 2026-09-05 23:11:02.896 | 6943ms | HTTP403，没有图片 |
| eyes-closed 闭眼 | 2026-09-05 23:11:09.855 | 1640ms | HTTP403，没有图片 |

本地账本：

- `AI_output/motion/.calls/12a4a02b1025201b9f5159270a37ec66960b4e4e0b1b86fbfdd98f99341167c0.json`
- `AI_output/motion/.calls/243e01ba4559ef16014df17f1c422f268242a282d3855d2f670b66dbc12f56b0.json`

报告和精确提示词：`AI_output/gemini-probe/report.json`、`mouth-open-prompt.txt`、`eyes-closed-prompt.txt`。两次均未返回可记录的request ID。累计账本18/39（包含历史失败），不等于平台收费次数。

403说明收到拒绝响应，不是此前的EACCES或60秒无响应断流。但当前证据不能区分模型访问权限、API密钥授权、网关规则等具体原因。第一次实现未保留响应体具体错误字段，无法事后还原这两次403的详细业务原因；已补后续错误的安全code/message脱敏记录，并用模拟403验证，不为补日志擅自第三次生图。

首次运行脚本曾在TypeScript加载阶段报parameter property不支持，已改为strip-only兼容写法；该次未进入请求，也未新增调用账本，不算两次API请求之一。

## 验证与结论

94项Node测试及TypeScript检查通过，包含正确参考图请求、403脱敏、异常响应拒绝、GPT失败后单次Gemini回退、双账本、Gemini失败重入不再调用、GPT坏图片不触发额外付费。

**回退实现已接入，但两次真实Gemini测试都未生成资源，不能宣布Gemini链路可用，更不能据此宣称动画制作通过。** 此次停在403；应先通过平台对应时段日志确认拒绝原因，再在获得授权后测试，不重复消耗用户次数。

## 权限调整后重试：两次成功

用户告知已给该密钥增加相应模型使用权限，并明确授权重试。使用同一参考图、同一提示词、同一Vertex接口和请求参数，密钥仍从根目录.env读取；未修改密钥。2026-09-05北京时间23:17:55起，各重试一次mouth-open和eyes-closed，均成功返回图片并完成解码、尺寸校验和PNG落盘。

| 状态 | 端到端耗时 | responseId | 账本ID |
| --- | --- | --- | --- |
| mouth-open | 43918ms | rjKcauaZDNCSvdAPwKS2sAw | 59e19697cb782acf38cb71ce94e928e1d845d469bcb67defdf85417a39d9f2c7 |
| eyes-closed | 36503ms | 1DKcatGzIKyJ0ckPtsevOA | e2d4fe923e4805b15c3b8666898453f9134b9d423cbf78b0f145d8742e01826d |

原始图均1696×2528；保留.raw原始字节，并按既有比例容差校验后全图缩放为1024×1536 PNG（不裁剪，轻微比例调整）。结果位于`AI_output/gemini-probe/approved-permission-retry-1/`，包含两张图片、原提示词及report.json。旧403账本与旧报告完整保留。测试脚本新增固定`--approved-permission-retry-1`入口，只给本次显式重试独立缓存身份，不改变提示词；重复执行复用成功结果，不能无限重试。累计账本20/39。

目视检查：大张嘴有明显口腔开口，闭眼图双眼闭合；尚未测量精确H/W，未将这两张新素材组装成动画验收。模型同时改变了部分非目标区域，不能用整张生成图替换不变底图；需要后续局部遮罩合成和原有对齐/像素不变校验。

结论：权限变更后，在请求构造不变的条件下两次成功，强烈支持此前403与模型授权有关；因旧响应正文未保留，不能追溯其具体业务错误码，也不能用本次结果解释其他历史ECONNRESET。此次确认Gemini直接请求→接收→解码→落盘可用，不等于真实GPT故障自动回退全链路或动画质量已验收。6项Gemini/回退测试及TypeScript检查通过。根.env付费开关已恢复0，没有第三次请求。
