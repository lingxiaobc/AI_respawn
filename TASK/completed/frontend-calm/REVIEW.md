# 声息前端视觉优化验收记录
日期：2026-09-11。方案 PT-frontend-calm v1。

## 实际变更
- 应用：apps/web/src/styles.css。
- 新增隔离验证脚本：scripts/verify-frontend-design.ts。
- 追踪及证据：本任务包，以及 artifacts/frontend-design* 截图目录。
- baseline-hashes.json 与 boundary-and-contrast.json 记录实施前基线和最终边界核对。除 CSS 外原有源码/配置/依赖/文档哈希均不变。没有提交、推送或部署。

## 验证
- npm.cmd test：67/67通过。
- npm.cmd run check：通过。
- npm.cmd run build：通过，25个模块。
- git diff --check：通过；仅现有CRLF转换警告。
- node --experimental-strip-types scripts/verify-frontend-design.ts：通过，独立临时SQLite、模拟上游和独立Chrome上下文；专用Vite5174，未停止既有5173服务。截图目录由 DESIGN_CAPTURE_NAME=frontend-design-accepted 指定。
- artifacts/frontend-design-accepted/result.json：38张截图，登录/错误、用户空态与创建、分配/专属设定、管理员密码表单、人物状态/长内容/管理弹窗、用户列表/空态、通话等待/连接/闲置警告/时限/纯音频/结束/诊断、诊断页。
- 视口：1440x1000、1280x900、320x844、390x844、320x740、844x390；200%字体、减少动态效果、键盘Tab/Escape检查。只报告浏览器仿真，不代表真机。
- 主要文字、输入框边界、危险操作边界和选择/焦点色共7组不透明色对比达到记录阈值；不是完整WCAG审计。
- 真实上游调用：0。受保护的原有数据库未写入。

## 独立只读复核
复核代理 Hubble，id 01a08f9a-65a5-7a12-bfc2-3eb5103b9d23，fork_context=false，初始仅原需求、已批准视觉约束和证据，不含设计者辩护。
- 初次固定集 artifacts/frontend-design：实际查看33张新图及4张旧版对照。确认统一配色、管理页减少嵌套、任务主线清楚。指出纯音频/倒计时及结束页信息叠印。
- 接受两项缺陷：用CSS网格将模式、倒计时、操作及诊断分行，未变动通话事件或状态逻辑。
- 采纳手机标题换行建议：text-wrap: balance 和局部间距调整。
- 管理员人物库标题改文案的偏好建议暂不采用：原任务主线及文案保持不变，本次聚焦展示规则。
- 新固定集 artifacts/frontend-design-accepted：代理实际查看5张定点截图，确认两处遮挡消除，相邻控件无新增重叠或裁切，320/390标题不拆开“通话”。
- 本轮H-01获得有限支持：视觉一致性与任务层级得到外部只读观察支持；没有真实用户效率研究。

## 保留边界
- 既有账户弹窗卸载后不自动恢复触发按钮焦点；Tab仍可继续操作。未改变此行为，不能声明完整无障碍验收。
- 结束态仍保留此前纯音频模式文案，已无视觉叠印；调整状态文案/显示条件需要交互或状态改动，本轮不做。
- 截图使用1px黑色测试人像，不评价实际照片质量、视频渲染或真实通话性能。
- 未验证物理iOS/Android键盘、安全区、浏览器栏或真实辅助技术。

