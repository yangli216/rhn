# 可运行页面模板

按 [前端开发入口](../../../../../docs/ai/frontend-ui.md) 选型，规则见 [UI 规范](../../../../../docs/用户界面设计与开发规范.md)。

四个模板均直接复用 shared/ui，不引入另一套按钮、表格或页签。它们固定结构、留白和滚动边界，业务负责数据、权限和异步状态。源码为 `PageTemplates.tsx`，CSS 随组件导入。

```tsx
import { DataTable, SearchField } from '../../shared/ui'
import { ListPage } from '../../shared/ui/templates/PageTemplates'

<ListPage title="业务查询"
  filters={<SearchField label="搜索业务" value={query} onChange={setQuery} />}
  footer={pagination}>
  <DataTable aria-label="业务结果">{/* thead + tbody，按 tableCellClass 声明列语义 */}</DataTable>
</ListPage>
```

| 模板 | 必填业务插槽 | 滚动归属 |
| --- | --- | --- |
| ListPage | title、filters、children | 内建 TableShell；children 不要再包 TableShell；resetScrollKey 传筛选与页码以复位结果滚动 |
| MasterDetailPage | title、navigation、navigationLabel、children | navigationHeader / navigationFooter 固定，navigation 只放列表；detailHeader / detailFooter 固定，详情正文默认滚动 |
| WorkbenchPage | title、queue、queueLabel、reference、referenceLabel、children | queueHeader / queueFooter 固定，队列正文独立滚动；宽内容区主作业/辅助区独立，较窄 PC 内容区合并正文滚动 |
| FormPage | title、onSubmit、footer、children | 正文滚动；footer 保持可见，主提交仅放此处 |

完整可复制的用法在 `src/dev/PageTemplateGallery.tsx`，分别是 ListExample、MasterDetailExample、WorkbenchExample、FormExample。演示包含模拟状态、搜索清空、选择对象、保存失败与重试，不访问 API。迁入业务模块时接入真实查询/写入、鉴权及并发策略，不保留模拟状态选择器或模拟延时。

打开运行中的 Vite 开发服务 `/ui-templates.html` 即可查看；不需要新起服务。演示有独立 HTML 入口，未接入 AppShell 路由、生产菜单或默认构建入口。使用浏览器实际视口 1280/1440/1920px 验收；演示保留侧栏占位以反映医疗工作站可用宽度，并有长数据开关。

集成要求：模板所在父容器需有受约束的高度，并允许 flex 子元素收缩（`min-height: 0`）。当前 AppShell `.workspace-content` 满足此条件。不要在模板外再包自动增长的普通 div，否则内部滚动可能失效。默认 compact，唯一 H1 由 PageHeader 输出；上下文和分组使用 H2。

主从页的目录和详情默认填满剩余高度；列表的空/少/多行不改变外框高度。固定筛选和分页不属于正文滚动区，目录条目不允许因 Flex 收缩而挤压。表格保持自然行高，宽表只在数据区内部横向滚动。

```tsx
<MasterDetailPage title="目录维护" navigationLabel="对象目录"
  navigationHeader={<SearchField label="搜索对象" value={query} onChange={setQuery} />}
  navigation={items} navigationFooter={pagination}
  navigationResetScrollKey={`${query}:${page}`}
  detailHeader={<>{objectContext}{tabs}</>}
  detailLabel="对象详情" detailScroll="content" detailResetScrollKey={selectedId}>
  <TableShell scrollLabel="详情结果" resetScrollKey={selectedId} footer={resultSummary}>
    <DataTable>{rows}</DataTable>
  </TableShell>
</MasterDetailPage>
```

默认 `detailScroll="pane"` 适用于说明、表单和普通详情；示例用 `content` 将滚动交给 TableShell，外层只负责高度分配。并列列表/辅助区可组合导出的 `WorkspacePane`，支持 `label`、`header`、`footer`、`scroll`、`resetScrollKey`。只保留两层面板表面，更多分组用标题和分隔线。复位 key 应包含真正改变阅读对象的表、页签、筛选或页码，不包含保存状态/加载状态；复位不会卸载子组件或清空草稿。

密度：相邻面板和页面标题到正文默认间距 8px，表单业务分组间距 12px，分别复用 `--layout-panel-gap` / `--layout-section-gap`；父容器 gap 与标题 margin 不叠加。面板正文默认上下 8px、左右 12px；首个 PanelHead 的留白不与正文叠加。标题标准档最小高度 36px、大字档 40px，操作按钮和多行文字可自动撑高；表单区块间隔 12px、字段垂直外边距 8px。该密度随模板复用，不在新页面重复覆盖标题高度。

验收记录：2026-09-22 用户确认模板总体符合规范，并要求提升纵向空间利用率；本轮据此收紧共享 Panel 标题和模板相邻留白，调整后的视觉效果待复核。模板是后续统一维护入口，不代表所有既存页面已经符合规范。

同日根据表结构工作台反馈，补齐固定头尾插槽、剩余高度分配、稳定滚动条空间和滚动复位。人工验收需组合 1280/1440/1920px 宽度与 720/900/1080px 高度，检查长列表滚动到底后筛选/分页是否仍在原位，以及少量/空数据是否仍保留稳定外框。

字体验收：模板页提供「标准 / 大字」切换，与个人菜单使用同一浏览器偏好。在两个档位下检查四种模板、长文本、编辑字段、弹窗和主操作可见性；切换不应清除当前表单输入。
