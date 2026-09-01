# TASK 归档索引

更新时间：2026-09-01（归档完成）  
分类规则：`completed/` 保存已完成里程碑，`superseded/` 保存被替代或暂停的历史路线，`TASK/` 根目录只保留当前活动入口。所有归档均为可逆移动，不删除原始内容。

## 当前活动入口

| 主题 | 计划 | 任务跟踪器 | 当前边界 |
| --- | --- | --- | --- |
| Live2D 前端结合 | [PLAN_live2d-portrait-animation](../PLAN_live2d-portrait-animation.md) | [TASK_live2d-portrait-animation](../TASK_live2d-portrait-animation.md) | Live2D 前置资源已完成；前端舞台、眨眼/音频驱动尚未开始 |

## 原始 TASK/PLAN 清单（A-01 盘点）

以下 16 份文件是本次清理前 `TASK/` 根目录中的历史记录；另列出的本次归档计划/跟踪器属于本次操作自身。

### 已完成：`completed/`

| 原文件 | 分类依据 | 归档位置 |
| --- | --- | --- |
| `PLAN_ai-respawn-auto-turn.md` | 计划已批准并完成自动回合主线 | [completed/PLAN_ai-respawn-auto-turn.md](completed/PLAN_ai-respawn-auto-turn.md) |
| `TASK_ai-respawn-auto-turn.md` | `execution_status: COMPLETED`，全部检查项完成 | [completed/TASK_ai-respawn-auto-turn.md](completed/TASK_ai-respawn-auto-turn.md) |
| `PLAN_ai-respawn-ptt-demo-v2.md` | PTT v2 尖刺杂音修复及 5 轮浏览器验收已由用户确认完成 | [completed/PLAN_ai-respawn-ptt-demo-v2.md](completed/PLAN_ai-respawn-ptt-demo-v2.md) |
| `TASK_ai-respawn-ptt-demo-v2.md` | `execution_status: COMPLETED`；T-09/T-10 为跟踪器遗漏勾选，已补齐 | [completed/TASK_ai-respawn-ptt-demo-v2.md](completed/TASK_ai-respawn-ptt-demo-v2.md) |
| `PLAN_ai-respawn-diagnostics.md` | 诊断计划已完成 | [completed/PLAN_ai-respawn-diagnostics.md](completed/PLAN_ai-respawn-diagnostics.md) |
| `TASK_ai-respawn-diagnostics.md` | `execution_status: COMPLETED`，全部检查项完成 | [completed/TASK_ai-respawn-diagnostics.md](completed/TASK_ai-respawn-diagnostics.md) |
| `PLAN_realtime-timeout-diagnostics.md` | 超时诊断计划已完成 | [completed/PLAN_realtime-timeout-diagnostics.md](completed/PLAN_realtime-timeout-diagnostics.md) |
| `TASK_realtime-timeout-diagnostics.md` | `execution_status: COMPLETED`，全部检查项完成 | [completed/TASK_realtime-timeout-diagnostics.md](completed/TASK_realtime-timeout-diagnostics.md) |
| `PLAN_live2d-portrait-skill.md` | Live2D 可复用技能创建已完成 | [completed/PLAN_live2d-portrait-skill.md](completed/PLAN_live2d-portrait-skill.md) |
| `TASK_live2d-portrait-skill.md` | `execution_status: COMPLETED`，技能入口与验证记录完成 | [completed/TASK_live2d-portrait-skill.md](completed/TASK_live2d-portrait-skill.md) |
| `PLAN_live2d-layer-rigging.md` | 用户已确认 Live2D 前置资源与最终模型检查完成 | [completed/PLAN_live2d-layer-rigging.md](completed/PLAN_live2d-layer-rigging.md) |
| `TASK_live2d-layer-rigging.md` | 旧细项状态落后于用户最终确认；原文保留并以完成摘要关闭前置里程碑 | [completed/TASK_live2d-layer-rigging.md](completed/TASK_live2d-layer-rigging.md) |
| — | 用户确认、最终模型路径、全脸非空底图约束及技能入口的汇总证据 | [completed/live2d-preparation-complete.md](completed/live2d-preparation-complete.md) |

### 被替代/暂停：`superseded/`

| 原文件 | 分类依据 | 归档位置 |
| --- | --- | --- |
| `PLAN_ai-respawn-ptt-demo.md` | PTT v1 已由同 `plan_id` 的 v2 取代 | [superseded/PLAN_ai-respawn-ptt-demo.md](superseded/PLAN_ai-respawn-ptt-demo.md) |
| `TASK_ai-respawn-ptt-demo.md` | v1 tracker 为暂停状态，不再作为执行入口 | [superseded/TASK_ai-respawn-ptt-demo.md](superseded/TASK_ai-respawn-ptt-demo.md) |

### 本次归档任务自身

归档计划已完成；以下行政记录也已进入 `completed/`，不构成项目功能活动入口：

| 文件 | 归档路径 | 状态 |
| --- | --- | --- |
| `PLAN_task-archive-roadmap.md` | [completed/PLAN_task-archive-roadmap.md](completed/PLAN_task-archive-roadmap.md) | `COMPLETED` |
| `TASK_task-archive-roadmap.md` | [completed/TASK_task-archive-roadmap.md](completed/TASK_task-archive-roadmap.md) | `COMPLETED` |

## 根计划迁移

旧版根计划在重写前保留副本：[superseded/AI_RESPAWN_DEMO_PLAN_v1.md](superseded/AI_RESPAWN_DEMO_PLAN_v1.md)。副本与旧版原文字节数和 SHA-256 均一致（`3C23BB9E2A9C253225EC72CD206CE1C24FBEA352F1FDA69026C35202C40BD5F6`）。当前路线图仍位于 [../../AI_RESPAWN_DEMO_PLAN.md](../../AI_RESPAWN_DEMO_PLAN.md)，不再把 PTT v1 作为待执行入口。

## Live2D 前置完成证据

- 最终模型：`AI_output/live2d/model/portrait_cubism_final.cmo3`
- 全脸非空底图：`AI_output/live2d/model/portrait_cubism_fullbase.psd`
- 可复用技能入口：`.agents/skills/live2d-portrait-rigging/SKILL.md`
- 规格与映射：`AI_output/live2d/ART_SPEC.md`、`AI_output/live2d/ASSET_MANIFEST.md`、`AI_output/live2d/model/LAYER_MAP.md`
- 用户已反复确认拖动无白边、无重影、无破洞，眼睛和嘴巴正常，保存并重启重开后仍正常。
- 硬约束：底图一律使用全脸、非空、全不透明底图；这不等于前端结合已完成。

## 引用检查

在归档前对仓库（排除 `TASK/archive/`）搜索了旧根计划名、PTT v1 标识和旧 TASK 路径；除计划/跟踪器自身的历史说明外，未发现隐藏引用。归档后应再次检查活动入口、索引链接和根计划链接。

## 维护规则

1. 新活动计划留在 `TASK/` 根目录，并在本索引的“当前活动入口”登记。
2. 完成后成对移动到 `completed/`；暂停或被替代的路线移动到 `superseded/`，同时注明替代入口。
3. 不删除历史文件；根计划只描述当前路线，旧版本通过 `superseded/` 副本恢复。

## 归档完成验证

- 根计划与 9 份历史/活动 PLAN（含本次归档计划）均通过 `validate-plan.py`（0 error / 0 warning）。
- 9 份历史/活动 TASK tracker（含本次归档 tracker）均通过 `validate-task-tracker.py`；PTT v2 的批准摘要已同步为 `sha256:574d3e86ce87187366f495c8ee5ab531a22e4a9c308072353dd811845d2bf59d`。
- 根计划、索引和 Live2D 完成摘要的本地 Markdown 链接均已检查，无断链。
- `git diff --check` 无空白错误；验证期间未修改代码、模型、PSD、源图或技能资产。
