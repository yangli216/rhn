# V6：PC 工作台与职责分区

日期：2026-09-15。用户反馈：新增和修改页面内容堆砌、职责混杂、留白与滚动过多。本轮仅重构前端交互，不改变 AI 接口或取数口径。

## 交互结构

- 功能库：左侧保存列表，右侧查询结果；常规查看不展示 AI 对话、创建模板和编辑器。
- 新建：左右分栏选择展示形式、描述业务需求。收到澄清后在需求区继续回答；生成成功自动进入编辑工作台。
- 编辑：暂时收起功能库，左侧 AI 对话与固定输入区，右侧结果工作区。AI 面板可收起、恢复，草稿输入保留。
- 结果预览、数据明细、计算配置、变更对照通过页签切换，互斥展示。统计列表直接显示表格，图表类页面不再默认重复铺设表格。
- 计算配置先选指标，只编辑当前指标；分组与筛选支持直接修改，更新后自动回到结果预览。
- 顶部固定保存、撤销、返回操作；日期范围和更新预览常驻；内容区域各自滚动，避免整页长距离上下寻找按钮。
- 来源说明、结果统计口径按需展开。图表根据容器宽度重新布局，避免在大屏中央缩成小图。
- 页签支持左右方向键，AI 输入支持 Ctrl/Command+Enter。返回时可选择继续编辑或放弃未保存调整；晚到的 AI 响应不覆盖返回后的页面。

## 主要文件

- frontend/src/features/analytics/DynamicAnalysisLibrary.tsx
- frontend/src/features/analytics/AnalysisPlanEditor.tsx
- frontend/src/features/analytics/dynamic-analysis.css
- frontend/src/features/analytics/DynamicAnalysisLibrary.test.tsx

入口：<http://localhost:15176/analytics>。当前仍保留 V5 的能力边界：对话不跨刷新保存；编辑固化为新功能，原定义保留。未 commit / push。
