# UI 速查表

写前端页面前先读本页。这里只放最常用的数值和写法，规则依据见 [UI 规范](../用户界面设计与开发规范.md)，组件 API 见 [shared/ui](../../frontend/src/shared/ui/README.md)，流程见 [开发入口](frontend-ui.md)。本页与规范不一致时以规范为准，并同步修正本页。

## 1. 开工前写一行声明

`页面类型 / 模板 / 共享组件 / 主操作位置 / 滚动归属 / 必要例外`

例：`临床作业 / WorkbenchPage / PanelHead+PaneBody+DataTable+StatusBadge / 主作业区底部 / 队列与主作业各自滚动 / 无`

## 2. 数值表

只用令牌，不写字面量。“标准 / 大字”两档由令牌自动切换，业务代码不判断档位。

| 用途 | 令牌 | 标准 | 大字 |
| --- | --- | ---: | ---: |
| 页面标题 H1 | `--font-size-h1` | 20px | 24px |
| 弹窗/区块标题 H2 | `--font-size-h2` | 18px | 22px |
| 面板标题 | `--font-size-h3` | 16px | 20px |
| 正文、表格、标签、按钮 | `--font-size-body` / `--font-size-table` | 14px | 16px |
| 辅助信息（时间、单位、说明） | `--font-size-small` | 12px | 14px |
| 输入框、下拉框、搜索框、日期框、默认按钮 | `--control-height-default`（同一令牌，保证同高） | 40px | 44px |
| 紧凑按钮（标题栏操作、表格行内） | `--control-height-sm`，写 `Button size="sm"` | 32px | 36px |
| 显式大号按钮（重要操作） | `--control-height-lg`，写 `Button size="lg"` | 48px | 52px |
| PanelHead 最小高度 | `--panel-header-min-height` | 36px（有操作 40px） | 40px（有操作 44px） |
| 相邻面板间距 | `--layout-panel-gap` | 8px | 8px |
| 业务分组间距 | `--layout-section-gap` | 12px | 12px |
| 面板正文内边距 | 模板内建（`PaneBody` / `WorkspacePane`） | 上下 8px，左右 12px | 同左 |
| 普通页面边距 / 工作台边距 | `--layout-page-gutter` / `--layout-workspace-gutter` | 24px / 16px | 同左 |
| 其他间距 | `--space-1` 至 `--space-4` | 4 / 8 / 12 / 16px | 同左 |

`sm` 只用于标题栏和表格行内；输入框同行的按钮一律不写 `size`。不存在 13px、15px、12.5px 这类字号，也不存在 6px、10px 这类间距。设计稿或参考页面出现这类值时，取最近的令牌。

## 3. 用什么

| 需求 | 用这个 | 不要 |
| --- | --- | --- |
| 页面骨架 | `ListPage` / `MasterDetailPage` / `WorkbenchPage` / `FormPage` | 手写 grid 外壳 |
| 面板标题、数量、刷新 | `PanelHead title meta actions` | 自建标题条，或在正文再写一行“共 N 条” |
| 工作台主作业/辅助区正文 | `PanelHead` + `PaneBody` | 把正文直接放进外框（会贴边、不能滚动） |
| 并列列表/辅助区 | `WorkspacePane label header footer` | 嵌套第二层滚动容器 |
| 横向查询栏 | `ui-query-filters` + `SearchField` + `FormField` + `ui-query-filters__actions` | 业务 CSS 定义搜索框宽度或用 `margin-left: auto` 推远按钮 |
| 表格行高/边距 | `DataTable` 默认值：表头 40px，单行约 40px，单元格上下 8px 左右 16px；不要覆盖 padding/height | 自己给 td/th 写 padding、height、斑马纹 |
| 名称+编码、日期+时区等成对信息 | `CellStack primary secondary mono`，同一列两行（约 56px） | 拆成两个窄列；自写两层 div |
| 表格里的状态 | `StatusBadge`，状态列居中不换行 | 纯文字“可用/停用” |
| 表格 | `TableShell` + `DataTable` + `tableCellClass('numeric' / 'status' / 'actions' / 'control')` | `<table>`，或用 `nth-child` 对齐列 |
| 连续录入 | `EditableTable` | 自写行编辑 |
| 状态 | `shared/presentation` 映射 → `StatusBadge tone` | 在组件里按状态拼颜色 |
| 下拉 | 字典 `DictionarySelect`；固定选项 `Select`；RHF `FormSelect`；诊断/药品/项目 `ClinicalResourceSearch` | `<select>` |
| 按钮 | `Button variant`；标题栏图标 `IconActionButton` | `<button>`，或业务 CSS 改按钮外观 |
| 输入框旁的按钮（查询、添加、重置） | `Button`，**不写 `size`**，与输入框同高 | `size="sm"`（会比输入框矮，门禁 `control-size-mismatch` 会拦截）；业务 CSS 里给输入框或按钮另设高度（门禁 `control-height-override` 会拦截） |
| 标题栏、表格行内的操作 | `Button size="sm"` | 在标题栏/表格行里用默认大小撑高行 |
| 紧凑工具栏里的搜索框 + 按钮（如候诊栏） | `SearchField size="sm"` + `Button size="sm"`（成对，同为 32px）；清空要联动页面状态时用 `onClear` | 只把按钮改 sm、输入框保持默认高度 |
| 页面/工作区主切换（一级） | `Tabs variant="workspace"`，每页一组，紧贴页头下方 | 在面板里再放 workspace；自写 `role="tab"` |
| 面板/详情内分区（二级） | `Tabs`（默认 `line`），放在所属面板内 | 与一级页签并排；嵌套第三层页签 |
| 只改变筛选值的单选组（时间范围、视图模式） | `SegmentedControl`（2–5 项） | `button` + `aria-pressed` 自拼样式；用 `Tabs` 却不切换内容 |
| 带数量的紧凑分段页签 | `Tabs variant="segmented"`，数量放进 `meta`（字符串），完成类页签加 `tone: 'success'` | 自写 `role="tab"` 的 button 和数量角标 |
| 空/加载/失败 | `EmptyState` / `LoadingState` / `Alert` | 自写提示块 |
| 弹窗、抽屉 | `Dialog`（抽屉 `presentation="drawer"`） | `<dialog>` 或自写遮罩 |
| 日期、数量、金额显示 | `shared/format.ts`、`utils/dateRange.ts`、`utils/precision.ts` | `toLocaleString`、`new Intl.*` |

- 令牌只用 `styles/tokens.css` 里真实存在的（间距 `--space-1…16`、字号 `--font-size-small/compact/body/h3…`）；别自创 `--space-0-5`、`--font-size-tiny`、`--color-text-muted`，门禁 `undefined-token` 会拦。
- 新写的业务 CSS 只放布局（grid/flex/宽高/间距/溢出）；要改颜色、背景、边框、字体，先找共享组件或模板。必须自己写时，在声明上方加 `/* ui-allow: 原因 */`，门禁 `css-layout-only` 才会放行。

## 页面骨架默认约束（先选模板，再写业务）

1. **边距只由页面框架给**：页面根容器、工作台根容器不写 `padding`/`margin`（含 12px/16px）；面板间距只用父容器 `gap: var(--layout-panel-gap)`；面板正文留白由 `WorkspacePane` / `PaneBody` 提供。
2. **主功能区不出现整页滚动**：页头以下的作业区占满剩余可视高度，面板、列表默认等高铺满；滚动只出现在各面板正文（或 `TableShell`）内部。不写 `100vh`/`100dvh` 高度，不写 `align-items: start` 让面板随内容收缩。
3. **怎么写**：标准结构用 `ListPage / MasterDetailPage / WorkbenchPage / FormPage`；非标准列数用 `WorkspaceColumns columns="…"` 包 `WorkspacePane`。同一行的面板头高度必须一致（都用 `PanelHead`，不要有的带说明有的不带；说明放 `meta`）。
4. 页头与作业区之间的统计条、提示条，与下方作业区的间距用 `margin-bottom: var(--layout-panel-gap)`，不要贴着面板。作业区底部操作栏（footer）里的按钮靠右成组：低强调的重置/取消在左、次操作居中、主操作在最右，不要把重置推到最左边。
5. 门禁 `css-page-layout` 会拦截新增的根容器内边距/外边距和视口单位高度；是否整页滚动需要在走查时用 1280/1440/1920 宽度验证。

## 4. 正反例

```css
/* 不要：字面量、非令牌字号、改共享控件外观 */
.order-card { padding: 10px 14px; font-size: 13px; color: #526663; }
.order-toolbar .ui-button { height: 30px; line-height: 1.4; }

/* 要：业务 CSS 只负责布局，视觉值用令牌 */
.order-card { padding: var(--space-2) var(--space-3); }
.order-card__meta { color: var(--color-text-secondary); font-size: var(--font-size-small); }
.order-toolbar { display: flex; gap: var(--space-2); }
```

```tsx
// 不要：标题和数量各占一行，正文直接塞进工作台外框
<WorkbenchPage ...>
  <h3 className="my-title">医嘱</h3>
  <div className="my-count">共 {orders.length} 条</div>
  <OrderList />
</WorkbenchPage>

// 要：数量进标题栏，正文进 PaneBody
<WorkbenchPage ...>
  <PanelHead title="医嘱" meta={`${orders.length} 条`} actions={<Button size="sm" variant="secondary">刷新</Button>} />
  <PaneBody label="医嘱内容"><OrderList /></PaneBody>
</WorkbenchPage>
```

## 5. 用户已确认的偏好

新页面默认执行，无需用户重复说明。来源见 UI 规范第 2.7 节和开发入口的认可登记。

- 正文优先，布局紧凑，对齐工整。先精简信息组织，再调间距；不靠缩小字号或隐藏关键信息来压缩页面。
- 垂直空间优先给正文：多行条目用紧凑行距，不为“透气”加大行高或条目间距（2026-10-28 确认）。
- 简单分组头一行，目录条目最多两行，辅助字段同行排列；数量、刷新放进所属标题栏。
- 宽屏用“目录 + 详情”或表格比较，不把完整内容纵向堆叠。PC 宽度 1280/1440/1920px，不写移动端断点。
- 查询栏：关键词有限宽度，条件按内容设宽，按钮组紧随条件，空间不足时自然换行（2026-10-12 确认为全局默认）。
- 同一工具行的搜索、读卡、刷新等控件同高；表格正文 14px，时间等辅助信息 12px，状态列居中且不换行（医生站候诊表格反馈）。
- 不重复展示同一信息：已有序号或标题时不再加第二套。

## 6. 交付前自检

1. 1280px 和大字档下没有横向溢出、没有被裁掉的正文，主操作可见。
2. 每一栏只有一个纵向滚动区；固定的筛选、分页、标题不随正文滚走。
3. 加载、空、无结果、失败、无权限五种状态都有。
4. `npm run ui:files -- <改动文件>` 通过（Claude Code 会自动执行）。
5. 改了共享组件、令牌、模板或全局样式：`npm run ui:visual`，差异先给用户确认。
6. 交付说明写明：模板与组件、偏离及原因、检查结果、待人工验收项。
