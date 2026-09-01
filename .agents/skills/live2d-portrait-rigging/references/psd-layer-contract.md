# PSD 与 Cubism 层/参数契约

本契约定义写实人像嘴眼模型的接口，不等同于某一个人物的 ROI 或文件名。进入 Cubism 前先完成机器检查和逐层清单；GUI 中只执行已经通过闸门的 PSD。

## PSD 文件契约

- 所有状态层必须是同一画布尺寸、同一原点、同一像素坐标系的全画布图层。
- `static_locked_base` 必须是完整全脸、非空、全不透明原图；它不可被挖洞、裁剪或替换为生成整脸。
- PSD 图层名称必须逐层唯一、稳定、可与 manifest 一一对应。批量生成后必须逐 scene 检查，不能只看最终缩略图。
- 使用 Cubism 目标版本实机可读取的色彩空间、位深和 Alpha；优先采用已验证的未压缩通道或其他实际可导入编码，不凭扩展名推断兼容性。
- 如果 PSD 编码无法在当前 Cubism 版本稳定验证，透明 PNG 层和 manifest 仍是权威源；切换为“脚本验证＋人工组装”，不继续盲试编码。
- PSD 组装后必须检查初始全层可见画面：应为原始闭嘴、双眼睁开的中性肖像。

## 标准十层

| 序号 | 层名 | 内容 | 绑定参数 |
| ---: | --- | --- | --- |
| 1 | `static_locked_base` | 完整全脸原图，非空、全不透明 | 无 |
| 2 | `eye_L_open_local` | viewer-left 睁眼局部 donor | `ParamEyeLOpen` |
| 3 | `eye_L_half_local` | viewer-left 半闭眼局部 donor | `ParamEyeLOpen` |
| 4 | `eye_L_closed_local` | viewer-left 闭眼局部 donor | `ParamEyeLOpen` |
| 5 | `eye_R_open_local` | viewer-right 睁眼局部 donor | `ParamEyeROpen` |
| 6 | `eye_R_half_local` | viewer-right 半闭眼局部 donor | `ParamEyeROpen` |
| 7 | `eye_R_closed_local` | viewer-right 闭眼局部 donor | `ParamEyeROpen` |
| 8 | `mouth_closed_local` | 闭嘴局部 donor；通常与底图重复 | `ParamMouthOpenY` |
| 9 | `mouth_half_local` | 半张嘴局部 donor | `ParamMouthOpenY` |
| 10 | `mouth_open_local` | 张嘴局部 donor | `ParamMouthOpenY` |

图层名中的 `L/R` 指画面 viewer-left/viewer-right，不能凭操作者左右手重新解释。若项目采用其他命名，必须在 manifest 中提供显式映射，不得让名称和绑定参数含糊。

## 完整底图累积覆盖表

以下是标准三参数的默认实现。每个局部层均使用 Alpha Blend=Over、无剪贴、无反转蒙版，除非项目另有经过批准的证据。

| 图层 | 参数 | 绘制顺序 | 0 | 0.5 | 1 |
| --- | --- | ---: | ---: | ---: | ---: |
| `static_locked_base` | 无 | 400 | 100% | 100% | 100% |
| `mouth_closed_local` | `ParamMouthOpenY` | 500 | 0% | 0% | 0% |
| `mouth_half_local` | `ParamMouthOpenY` | 510 | 0% | 100% | 100% |
| `mouth_open_local` | `ParamMouthOpenY` | 520 | 0% | 0% | 100% |
| `eye_L_open_local` | `ParamEyeLOpen` | 500 | 0% | 0% | 0% |
| `eye_L_half_local` | `ParamEyeLOpen` | 510 | 100% | 100% | 0% |
| `eye_L_closed_local` | `ParamEyeLOpen` | 520 | 100% | 0% | 0% |
| `eye_R_open_local` | `ParamEyeROpen` | 500 | 0% | 0% | 0% |
| `eye_R_half_local` | `ParamEyeROpen` | 510 | 100% | 100% | 0% |
| `eye_R_closed_local` | `ParamEyeROpen` | 520 | 100% | 0% | 0% |

含义：底图永远提供闭嘴和双眼睁开像素；默认重复层不再覆盖底图；半态和终态层逐步覆盖局部区域。只有在同一输入的像素证据明确要求时，才可修改该表并重新审批。

## 参数契约

- `ParamMouthOpenY`：0=闭嘴，0.5=半张嘴，1=张嘴；默认 0。
- `ParamEyeLOpen`：0=viewer-left 闭眼，0.5=半闭，1=睁眼；默认 1。
- `ParamEyeROpen`：0=viewer-right 闭眼，0.5=半闭，1=睁眼；默认 1。
- 参数范围、默认值和关键点必须在 Cubism 中逐项确认；不能只依赖参数名称或脚本清单。
- 每个 ArtMesh 只能绑定到预期参数。操作一个参数时，其他两个区域必须保持不变。

## 导入前检查

1. manifest 层数、名称、尺寸、原点和文件哈希一致。
2. `static_locked_base` 全脸非空，Alpha 全覆盖；不能存在透明洞。
3. 所有状态层的 Alpha 只在允许 ROI 内变化；蒙版外与原图 diff 为零。
4. 默认重复层（闭嘴、左右睁眼）全节点为 0%；半态/终态层的覆盖表与参数映射一致。
5. 没有重复图层名、错误通道、错误参数 ID、剪贴或反转蒙版。
6. 联系表覆盖默认、半态、终态、嘴开＋双眼闭以及至少一个中间组合。

## Cubism 手工闸门

- 导入后先取消所有对象选择，检查初始中性画面，再逐层确认参数和绘制顺序。
- 一次只编辑一个区域：嘴→左眼→右眼；每个区域通过定点和往返拖动后才进入下一项。
- 任一白边、破洞、重影、突然换皮或参数联动，立即停在当前值；首查当前层的参数绑定、节点透明度、绘制顺序，再查 PSD Alpha。
- 每个区域通过后使用新文件名另存检查点；最终模型必须关闭重开并复测默认值、关键点和独立性。
