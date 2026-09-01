---
name: live2d-portrait-rigging
description: Prepare a realistic portrait for reusable Live2D mouth-and-eye rigging, from immutable source and local donors through Cubism PSD import, parameter setup, visual QA, save, and reopen verification. Use when a portrait reference must be split into safe local layers; do not use for front-end runtime integration, audio lip-sync, or publishing.
metadata:
  short-description: Reusable portrait-to-Cubism rigging workflow
---

# Live2D 写实人像分层与 Cubism 建模

把一张新的正脸参考图准备成可复用的嘴眼 Live2D 源模型。先建立证据和输入契约，再生成局部状态、组装 PSD、手动完成 Cubism 参数，最后做静态/动态/组合/重开验收。

## 不可违反的架构

- `static_locked_base` 永远是完整全脸、非空、全不透明的原始底图；不使用挖空底图。
- 原图只读保存；所有副本和输出使用新文件名，不覆盖用户资产。
- AI 或其他生成器只能提供局部 donor；最终层由蒙版限制，蒙版外像素必须与原图零差异。
- 半张嘴和半闭眼使用独立素材，不用极端状态直接交叉淡化。
- Cubism GUI 由用户手动操作；本技能不控制桌面、不代替用户判断自然度。
- 技能止于最终 `.cmo3` 关闭重开后的验收；不处理运行时导出、Web SDK、音频驱动、自动眨眼、发布或商业许可。

## 工作方式

1. 先读取 [规则登记表](references/rule-registry.md)，把历史资料中的有效规则和废弃路线分开。
2. 新人物先读取 [输入与美术契约](references/input-and-art-contract.md)。若无法提供全脸非空底图、局部 ROI 或蒙版外零差异证据，立即停止。
3. PSD 组装或检查时读取 [PSD 与 Cubism 层/参数契约](references/psd-layer-contract.md)，先通过尺寸、Alpha、图层名、状态表和联系表闸门，再进入 Cubism。
4. 进入 Cubism 后按 [建模参考](references/cubism-rigging.md) 一次处理一个区域，使用检查点另存；任何白边、破洞、重影、换皮或参数联动都停在当前区域回查。
5. 遇到导入、Alpha、图层命名、参数绑定或保存重开异常，读取 [故障与恢复手册](references/pitfalls-and-recovery.md)，按首查对象和回退路径处理，不整体推倒重做。
6. 若可用脚本存在，先运行资产审计和联系表生成器；脚本只检查结构、像素和清单，不替代 Cubism 视觉验收。

## 交接与证据

- 每个阶段写清输入、输出、依赖、验收和失败处理；人物特定的尺寸、ROI、颜色、文件名和临时数值只放在 manifest 或样例。
- 人工交接给 Cubism 前，必须有可读的十层名称、参数映射、透明度/绘制顺序表和蒙版外差异报告。
- 默认、半态、终态、中间值、参数独立拖动和最终关闭重开都要有证据；截图是证据，不是技能指令。
- 任何与完整非空底图、局部编辑边界或原图保护冲突的快捷方案都需要暂停并重新规划。
