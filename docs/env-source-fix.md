# 根目录 .env 为唯一项目配置源

## 原因与定位

旧 scripts/env.ts 仅在 process.env 不存在同名变量时写入 .env 的值，导致继承自电脑或启动程序的密钥优先。检查曾证实进程已有 ZENMUX_API_KEY，但不能据此推断所有历史请求的来源，更不能据此断言这就是 ECONNRESET 的原因。

## 修复

- 根 .env 路径按 scripts/env.ts 的仓库位置解析，不依赖终端当前目录。
- 每次加载清除继承的项目配置（ZENMUX、DOUBAO、ROLE、NORMALIZATION、MOTION、DIAGNOSTICS、LIVE2D、PLAYWRIGHT，以及PORT/图像计算参数），再写入 .env；未声明项使用代码默认值或报必填缺失，绝不读取电脑同名值。
- 文件缺失/不可读直接阻止启动；空密钥不会回退。支持引号、注释、多行和BOM。
- 服务端PORT移至加载后读取；Vite的SDK路径及浏览器检查入口也先加载根配置。
- 清除继承的VITE_*；禁用Vite二次.env加载，不接受apps/web/.env或.env.local、.env.production等覆盖文件。
- PATH、系统临时目录等OS执行变量保留，不修改电脑配置。第三方运行时自己的系统变量不等于项目业务配置。
- 未编辑真实.env、未输出密钥、未发送生成请求。已有进程必须重启才能采用新配置。

## 测试与使用变化

packages/role-resource/env.test.ts覆盖同名冲突、缺省变量清除、安全付费开关、空值、BOM和根路径。

本轮实际验证：80项Node测试通过，TypeScript检查通过；在真实进程中比较加载结果与根.env解析值，ZenMux、豆包及文件全部配置均一致。仅输出布尔结果，未输出任何配置值。未启动付费或实时通话服务；既有服务需重启才能采用新配置。

旧文档中的 `$env:ROLE_*`、`$env:PLAYWRIGHT_*` 等shell配置方式已失效：应在根.env配置后启动。UI验证入口要求根.env显式选择ROLE_ALLOW_PAID=0、ROLE_REPLAY_YOUTH=1、ROLE_PORT=8879、独立AI_output/role-ui-test/子目录及测试令牌，否则拒绝启动，避免旧测试假设失效而误发真实调用。

旧Ubuntu隔离验证脚本使用进程变量注入配置，不能继续作为本次改动后通过的证据；需迁移为隔离副本根.env再运行。不要将真实根.env复制给测试副本。本轮不自动更改用户配置或执行这些集成测试。
