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
| 控件高度 | `--control-height-sm` / `-md` / `-lg` | 32 / 40 / 48px | 36 / 44 / 52px |
| PanelHead 最小高度 | `--panel-header-min-height` | 36px（有操作 40px） | 40px（有操作 44px） |
| 相邻面板间距 | `--layout-panel-gap` | 8px | 8px |
| 业务分组间距 | `--layout-section-gap` | 12px | 12px |
| 面板正文内边距 | 模板内建（`PaneBody` / `WorkspacePane`） | 上下 8px，左右 12px | 同左 |
| 普通页面边距 / 工作台边距 | `--layout-page-gutter` / `--layout-workspace-gutter` | 24px / 16px | 同左 |
| 其他间距 | `--space-1` 至 `--space-4` | 4 / 8 / 12 / 16px | 同左 |

不存在 13px、15px、12.5px 这类字号，也不存在 6px、10px 这类间距。设计稿或参考页面出现这类值时，取最近的令牌。

## 3. 用什么

| 需求 | 用这个 | 不要 |
| --- | --- | --- |
| 页面骨架 | `ListPage` / `MasterDetailPage` / `WorkbenchPage` / `FormPage` | 手写 grid 外壳 |
| 面板标题、数量、刷新 | `PanelHead title meta actions` | 自建标题条，或在正文再写一行“共 N 条” |
| 工作台主作业/辅助区正文 | `PanelHead` + `PaneBody` | 把正文直接放进外框（会贴边、不能滚动） |
| 并列列表/辅助区 | `WorkspacePane label header footer` | 嵌套第二层滚动容器 |
| 横向查询栏 | `ui-query-filters` + `SearchField` + `FormField` + `ui-query-filters__actions` | 业务 CSS 定义搜索框宽度或用 `margin-left: auto` 推远按钮 |
| 表格 | `TableShell` + `DataTable` + `tableCellClass('numeric' / 'status' / 'actions' / 'control')` | `<table>`，或用 `nth-child` 对齐列 |
| 连续录入 | `EditableTable` | 自写行编辑 |
| 状态 | `shared/presentation` 映射 → `StatusBadge tone` | 在组件里按状态拼颜色 |
| 下拉 | 字典 `DictionarySelect`；固定选项 `Select`；RHF `FormSelect`；诊断/药品/项目 `ClinicalResourceSearch` | `<select>` |
| 按钮 | `Button variant size`；标题栏图标 `IconActionButton` | `<button>`，或业务 CSS 改按钮外观 |
| 空/加载/失败 | `EmptyState` / `LoadingState` / `Alert` | 自写提示块 |
| 弹窗、抽屉 | `Dialog`（抽屉 `presentation="drawer"`） | `<dialog>` 或自写遮罩 |
| 日期、数量、金额显示 | `shared/format.ts`、`utils/dateRange.ts`、`utils/precision.ts` | `toLocaleString`、`new Intl.*` |

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
