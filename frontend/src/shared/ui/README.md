# RHN 共享 UI 使用说明

业务模块统一从 `shared/ui` 引入公共组件，不复制通用结构或交互行为。

新增页面先读 [前端开发入口](../../../../docs/ai/frontend-ui.md)，并使用 [四种可运行页面模板](templates/README.md)。模板只负责页面编排，具体组件仍以本目录 API 为准。设计规则统一维护在 [UI 规范](../../../../docs/用户界面设计与开发规范.md)。

## 组件清单

| 组件 | 用途 | 已内建能力 |
|---|---|---|
| `Button` | 主、次、文字（静态即品牌色，与正文区分）、轻量品牌（`soft`，带浅底，用于字段旁的辅助操作）、危险操作 | 尺寸、禁用、稳定加载态、重复提交防护 |
| `IconButton` / `Icon` | 功能图标和装饰图标 | 统一 SVG、可访问名称、交互目标尺寸 |
| `IconActionButton` / `IconActionGroup` | 标题栏、分组头里的图标操作 | 紧凑文字按钮高度（不撑高标题栏）、品牌色 20px 图标、统一线宽、并排零间隙；传入任意图标节点；`count` 显示正数角标，含义由调用方提供可访问描述 |
| `AnchoredPanel` | 非模态参考浮层 | Portal、视口定位、点击外部 / Esc 关闭；`anchorElement` 允许触发器自行切换开关 |
| `PageHeader` | 一级页面标题区 | 眉题、唯一 H1、描述、操作区；PC 维护页支持紧凑模式 |
| `Panel` / `PanelHead` | 任务或信息集合 | 统一表面、标题层级、元数据位置 |
| `Tabs` | 页面或工作区页签 | 线性、工作区、卡片、pills 与 segmented（紧凑分段控件，`meta` 显示为数量徽标，`tone: 'success'` 让终态页签选中为成功色）变体；自动处理 ARIA、方向键、Home/End 与焦点移动 |
| `SearchField` | 列表和主数据检索 | 统一搜索图标、清空操作、焦点状态与可访问名称；`size="sm"` 为与 sm 按钮同行的紧凑高度，`onClear` 在点击内置清空按钮时回调 |
| `SplitWorkspace` | 左侧目录、右侧详情的主从页面 | 统一最小尺寸、间距和溢出边界，业务仅配置列宽 |
| `TableShell` / `DataTable` | 数据列表与表格 | 统一滚动容器、表头、行密度、悬停、列语义对齐和底部统计区 |
| `EditableTable` / `EditableRow` / `EditableCell` | 连续行录入列表 | 聚焦行进入编辑、离开行恢复阅读、统一控件尺寸、回车跳格及末格追加行 |
| `DatePicker` | 日期和药品效期录入 | 聚焦展开、失焦收起、日期格式化、效期快捷选项及不受表格裁剪的日历浮层 |
| `Pagination` | 长列表分页 | 上一页、下一页、页码播报和边界禁用状态 |
| `FormField` | 表单字段 | 标签绑定、错误关联、提示和统一控件样式 |
| `Select` | 通用下拉选择 | 单选、多选、名称/值/拼音首字母检索、清空、键盘操作、表单提交 |
| `DictionarySelect` | 字典下拉选择 | 按字典编码或 ID 加载启用项、名称/编码/拼音检索、编码展示、缓存及单选/多选 |
| `GridAddressInput` | 标准网格地址录入 | 单字段级联选择，支持省市县 3 级或省市县街道社区 5 级、12 位区划代码/名称/拼音码检索 |
| `RemoteSearchSelect` | 大规模主数据远程检索 | 输入后防抖请求、竞态保护、结果缓存、首项高亮、回车选择、辅助摘要与编码展示 |
| `ClinicalResourceSearch` | 临床业务主数据检索 | 通过 `resource` 配置诊断、通用药品或诊疗项目，统一适配接口和结果文案 |
| `FormSelect` | 表单下拉适配 | 与 React Hook Form 的 `control`、字段值和校验状态集成 |
| `TreePanel` | 分类、目录和层级对象维护 | 检索、展开/收起、选中、增改删操作插槽、拖拽与键盘排序、层级调整 |
| `RelationshipGraph` | 物理表和统计实体的直接关系 | 当前对象的一跳关系、完整连接条件、候选虚线、分页、键盘可访问的对象跳转；不推断不存在的关联 |
| `Alert` | 操作反馈与内容区提示 | toast / inline 两种位置；error/warning/success/info 语义、生命周期与读屏播报 |
| `StatusBadge` | 业务状态 | success/info/warning/danger/neutral 语义色 |
| `LoadingState` / `EmptyState` | 异步区域状态 | 状态播报、统一空状态结构和可选操作 |
| `Dialog` | 单任务弹窗 | 焦点约束、Escape、焦点恢复、滚动锁定 |
| `ObjectContextBar` | 居民、患者等对象上下文 | 身份、关键事实和主操作的统一位置 |
| `ActionMenu` | 次要对象操作 | 共享 Button 触发，支持方向键、Esc、外部点击关闭 |
| `BackButton` | 返回上层任务 | 统一图标、尺寸与焦点状态 |
| `Switch` | 开关选择 | 遵循 ARIA switch 语义规范，支持键盘 Space/Enter 操作、受控/非受控、sm/md 尺寸与随动状态说明 |

`ObjectContextBar` 的 `identityStatus` 插槽用于姓名旁的当前业务状态，`support` 插槽用于联系信息、候诊等辅助操作；业务布局可按实际容器宽度安排这些区域。`ActionMenu` 接受 `items`（`key`、`label`、`onSelect`，以及可选 `danger`、`disabled`），选择后关闭菜单并调用业务原有确认流程。

`SearchField` 可传 `inputRef`，用于 F1、Alt+K 等业务快捷键聚焦；清空后焦点仍回到同一输入框。有内容时也保持稳定的可访问名称，页面不需另写搜索外壳和清空按钮。

### 横向列表查询栏

统一布局定义在 `query-filters.css`，随 shared/ui 导入；尺寸的唯一来源是 `styles/tokens.css` 的 `--layout-query-*`。在现有 `form` / `div` / `section` 上添加 `ui-query-filters` 即可，保留原有提交、回车、清空与筛选事件，不另建查询状态模型。

| 类名 | 用途 |
| --- | --- |
| `ui-query-filters` | 容器底部对齐、统一间距、自然换行，固定于结果正文之外 |
| `ui-query-filters__group` | 同一查询栏中的子组，内部使用相同字段规则；容器不足时可收缩换行 |
| `ui-query-filter--keyword` | 普通 FormField / 自定义标签中的关键词；SearchField 直接子项自动使用有限搜索宽度 |
| `ui-query-filter--date` | 自定义日期范围外层；直接 DateRangePicker 或包含它的 FormField 自动识别 |
| `ui-query-filter--wide` | 需要容纳长字典文案的条件，使用共享宽字段令牌 |
| `ui-query-filter--toggle` | 复选条件按内容宽度显示 |
| `ui-query-filter` | 自定义“标签 + 控件”字段，使用标准字段宽度和上下排列 |
| `ui-query-filters__actions` | 紧随条件的按钮组，查询、重置等操作不拆开换行 |

```tsx
<form className="ui-query-filters" onSubmit={search}>
  <SearchField label="搜索业务" value={keyword} onChange={setKeyword} />
  <FormField label="业务状态"><Select value={status} options={statusOptions} onChange={setStatus} /></FormField>
  <FormField label="日期范围"><DateRangePicker value={dates} onChange={setDates} /></FormField>
  <div className="ui-query-filters__actions">
    <Button type="submit">查询</Button>
    <Button type="button" variant="secondary" onClick={reset}>重置</Button>
  </div>
</form>
```

业务 CSS 仅保留面板表面、外层留白及确有内容依据的专用尺寸；不再重复定义默认搜索/日期/状态宽度、Flex 排列和按钮组间距。`ListPage` 自动接入相同定义，传入并列条件即可。主从页侧栏搜索、录入表单、扫码操作区不套用横向查询栏规则。

业务枚举的文案和颜色不能写在功能组件中，应集中到 `shared/presentation.ts`，再传给 `StatusBadge`。

字体统一使用 `styles/tokens.css`：页面标题 20/24px，弹窗标题 18/22px，面板标题 16/20px，正文/表格/表单值/标签/按钮 14/16px，辅助信息 12/14px（标准/大字）。详见 UI 规范第 4.2 节；标题语义级别不等同于视觉字号。`FontSizeControl` 提供即时切换与浏览器本地保存，应用入口通过 `useFontSizePreference` 恢复设置，屏幕上以根节点 `data-font-size` 切换令牌。弹窗 Portal 继承根令牌，打印不随屏幕档位放大。

普通页面左右外边距由 `.page` 使用 `--layout-page-gutter`（24px）提供；高密度工作台主功能区使用 `--layout-workspace-gutter`（16px），二者不重复叠加。相邻面板默认横纵间距为 `--layout-panel-gap`（8px），较大业务分组为 `--layout-section-gap`（12px）。父容器负责 gap，子面板不额外叠加 margin；PageHeader 与正文默认相隔 8px，模板由父容器统一提供间距。

Panel 标题默认采用紧凑密度：普通 `PanelHead` 标准档最小高度 36px、大字档 40px；传入 `actions` 时统一增加到 40px / 44px，可承载 `sm` 次要按钮。上下内边距 4px、左右 12px，标题过长时省略并优先保证操作区完整。模板负责消除面板内边距与首个标题的重复留白，表单字段垂直外边距默认 8px。规则详见 UI 规范第 6.3 节。

## 表格列语义与对齐

`DataTable` 的普通文本列默认左对齐。其余列通过 `tableCellClass` 显式声明语义，并同时应用到该列的 `th` 和所有 `td`，确保标题与内容严格一致：`numeric` 数值列右对齐并使用等宽数字，`status` 状态列居中，`control` 选择/序号/展开等结构控制列居中，`actions` 操作列右对齐。`text` 可用于覆盖业务样式并明确恢复左对齐。

编号、手机号、证件号和条码虽然由数字字符组成，但不可计算，仍属于文本列。日期时间默认按文本左对齐；复合单元格按主信息语义判断；空值 `—` 跟随所在列。不要根据当前内容或 `nth-child` 推断列类型。

```tsx
import { DataTable, StatusBadge, tableCellClass } from '../../shared/ui'

<DataTable>
  <thead><tr>
    <th>项目</th>
    <th className={tableCellClass('numeric')}>金额</th>
    <th className={tableCellClass('status')}>状态</th>
  </tr></thead>
  <tbody><tr>
    <td>诊查费</td>
    <td className={tableCellClass('numeric')}>12.00</td>
    <td className={tableCellClass('status')}><StatusBadge tone="success">已结算</StatusBadge></td>
  </tr></tbody>
</DataTable>
```

## 连续行录入

采购计划、直接采购入库等连续输入场景统一使用 `EditableTable`。`EditableRow` 默认阅读态，点击字段或通过 Tab、程序焦点进入行时切换为编辑态；焦点离开该行和关联浮层后恢复阅读态。编辑器始终挂载，切换不会丢失输入值，也不会改变行高。

`EditableCell` 的 `display` 提供阅读值，子元素使用系统基础控件。普通只读内容继续使用 `td`。数值列在表头和单元格均设置 `tableCellClass('numeric')`，统一右对齐。组件将文本框、下拉框、日期和数量控件统一为小尺寸，无需业务页面再次覆盖高度、边框或焦点样式。

`TableShell` 的外框默认填满父容器剩余高度，滚动仅发生在 `.ui-table-scroll`，`footer` 保持可见。父容器必须提供连续的高度约束和 `min-height: 0`；不要给表格本身设置百分比高度拉伸数据行。`scrollLabel` 为可键盘进入的滚动区命名，`resetScrollKey` 在页码/筛选/对象变化时复位滚动，不重新挂载内容。只有参数未变化的刷新会保留当前阅读位置。

主从和多栏页面使用模板导出的 `WorkspacePane`：`header` / `footer` 固定，默认 `scroll="pane"` 由正文滚动；正文包含独立 TableShell 或并列阅读区时使用 `scroll="content"`，关闭外层滚动。它已内建于 MasterDetailPage；固定头尾插槽及示例见 [模板说明](templates/README.md)。默认外框高度与滚动条位置遵循 UI 规范第 5.4 节。

```tsx
<EditableTable onAppendRow={appendAndFocusNewRow} aria-label="采购连续录入">
  <thead><tr><th>批号</th><th>有效期</th></tr></thead>
  <tbody>{rows.map(row => <EditableRow key={row.id}>
    <EditableCell display={row.lotNo} placeholder="填写批号">
      <input className="ui-field__control" aria-label="批号" value={row.lotNo}
        onChange={event => updateRow(row.id, 'lotNo', event.target.value)} />
    </EditableCell>
    <EditableCell display={row.expiryDate}>
      <DatePicker aria-label="有效期" value={row.expiryDate}
        onChange={value => updateRow(row.id, 'expiryDate', value)} />
    </EditableCell>
  </EditableRow>)}</tbody>
</EditableTable>
```

Enter 按字段顺序前进，末格通过 `onAppendRow` 通知业务新增行；业务负责数据默认值与新行聚焦。已展开的下拉框、输入法选字和业务已处理的按键保留自身行为。`Select`、`DatePicker` 浮层内的焦点仍归属原行；新增带 Portal 的公共编辑器时，用 `useEditableRowScope` 将行标识放在浮层根节点的 `data-editable-row` 上。

## 示例

```tsx
import { Button, Icon, PageHeader, Panel, PanelHead, StatusBadge } from '../../shared/ui'
import { encounterStatusPresentation } from '../../shared/presentation'

const status = encounterStatusPresentation(encounter.status)

return <>
  <PageHeader
    compact
    eyebrow="门诊医疗"
    title="处方审核"
    description="审核当前患者的待提交处方。"
    actions={<Button><Icon name="add" />新建处方</Button>}
  />
  <Panel>
    <PanelHead title="待审核处方" meta="最近更新 10:32" />
    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
  </Panel>
</>
```

PC 端配置、基础数据和平台管理页面默认使用 `compact`。当前紧凑模式仍保留可见的标题和说明；眉题保留语义结构但视觉隐藏，较窄 PC 视口下说明可隐藏。工作区 Tab 不替代页面的唯一 H1，不另建重复标题或操作条。`PageHeader` 吸附在当前主内容滚动区顶部；固定工作区模板中标题本身不参与正文滚动，不能叠加第二层吸顶。带模块标题的页面顶部不保留可滚动空白。长列表固定分类、筛选和操作区，仅让 TableShell 的数据区滚动；普通表单保留一个正文滚动区；主从/工作台允许有明确边界的独立阅读区。完整规则见 UI 规范第 5 节。

平台管理页面不得自行用 `role="tablist"`、搜索输入框外壳或裸表格复制上述交互。业务差异通过 `Tabs` 的变体、组件 `className` 的布局修饰和表格单元格内容表达，不重复定义边框、圆角、焦点环、键盘行为或滚动规则。

反馈统一使用 `Alert`，按用途选择语义和位置，不在业务模块另建 Toast：

- 操作失败使用 `tone="error"`；成功回执使用 `tone="success"`。跨区域操作反馈沿用默认的顶部 `toast`，可关闭、自动消失，成功默认 4.5 秒、普通提示 5 秒、警告和错误 8 秒。
- 操作说明使用 `tone="info" placement="inline"`，需要注意的业务事项使用 `tone="warning" placement="inline"`。提示放在对应弹窗或业务区内，默认持续显示，不带关闭按钮或倒计时，不应在打开弹窗时冒出红色错误通知。
- `tone` 默认仍为 `error`，仅用于已有错误调用；一般说明和警示必须明确指定语义。`placement` 默认仍为 `toast`，保证已有操作反馈兼容。
- 两种形式均支持 `duration`、`dismissible` 和 `onDismiss`；显式控制生命周期时必须符合业务用途。`duration={null}` 表示持续显示，`dismissible` 可为内容区提示添加关闭操作。

```tsx
<Alert tone="success">保存成功</Alert>
<Alert tone="info" placement="inline">保存后继续核对诊毕资料。</Alert>
<Alert tone="warning" placement="inline">库存即将不足，请及时补货。</Alert>
<Alert duration={null} onDismiss={() => setError('')}>{error}</Alert>
```

## 字典下拉框

业务页面优先传稳定的 `dictionaryCode`，数据库主键只用于已明确绑定某条字典记录的场景。组件的值始终是字典项编码，展示名称由字典服务统一提供。

字典下拉框固定显示“左侧名称、右侧编码”，并支持按名称、编码和拼音首字母检索。例如“证件类型”可使用 `证件`、`ID_DOCUMENT_TYPE` 或 `zjlx` 检索。过滤后第一条可用记录会自动高亮，保持检索框焦点时可按回车快速选择，也可通过上下方向键切换高亮项。通用 `Select` 可通过 `searchKeywords` 为多音字或业务别名补充检索词。

下拉层统一挂载到页面顶层，并根据触发器位置自动向上或向下展开；宽度会在字段宽度、内容最小宽度和当前视口之间取安全值。业务页面不得通过提高层级、取消弹窗滚动或增加横向滚动条来修复下拉显示不全。

```tsx
import { useState } from 'react'
import { DictionarySelect, FormField } from '../../shared/ui'

const [documentType, setDocumentType] = useState('')
const [paymentMethods, setPaymentMethods] = useState<string[]>([])

<FormField label="证件类型">
  <DictionarySelect
    api={api.dictionaries}
    dictionaryCode="ID_DOCUMENT_TYPE"
    value={documentType}
    onChange={setDocumentType}
  />
</FormField>

<FormField label="支付方式">
  <DictionarySelect
    api={api.dictionaries}
    dictionaryCode="PAYMENT_METHOD"
    multiple
    value={paymentMethods}
    onChange={setPaymentMethods}
  />
</FormField>
```

如需按数据库主键读取，可将 `dictionaryCode` 替换为 `dictionaryId`。配合 React Hook Form 时使用 `Controller` 传递 `value` 和 `onChange`。

## 网格地址录入

网格地址不是普通字典，应统一使用 `GridAddressInput`。界面上表现为一个字段，展开后在同一浮层内级联选择；组件值保存各级 12 位统计用区划代码，名称与完整路径由网格地址服务提供。普通业务地址使用 `levels={3}`，公卫随访、家庭医生和居民精细化管理使用 `levels={5}`。

```tsx
import { GridAddressInput, type GridAddressValue } from '../../shared/ui'

const [address, setAddress] = useState<GridAddressValue>({})

<GridAddressInput
  api={api.gridAddresses}
  levels={5}
  value={address}
  onChange={(value, selectedPath) => {
    setAddress(value)
    console.log(selectedPath.map((node) => node.name).join('/'))
  }}
/>
```

三级和五级组件的默认宽度分别为 `36rem` 和 `52rem`，但不会超出所在表单。下拉浮层宽度独立于字段宽度，并只展示已选路径和下一个待选层级；选择上级后再逐级展开。每一级均支持名称、行政编码、数据维护的拼音码以及浏览器计算的拼音首字母过滤。改变上级时必须自动清空所有下级编码，业务页面不要自行拼接级联逻辑。

网格维护页在展示和写入前校验完整目录的节点字段、唯一编码、层级及路径；查询失败不能当成空树或默认停用状态。创建、更新和启停以服务端返回的目标、递增修订和提交内容确认结果，失败保留编辑草稿与原修订。保存或重新核实时同时失效 `grid-addresses` 和 `grid-address-options` 缓存，防止录入组件继续使用维护前的目录。网格写入接口目前没有请求编码幂等协议，响应丢失应提示未确认并重新加载核实，不能自动判定成功；状态重试保持原目标状态和修订，不随刷新后的状态反向切换。

共享录入组件同样核对候选目录，并要求节点全部启用且不超过请求层级。已有地址必须按编码对应正确层级和真实父子链；未知、缺级、错配或未选到目标层级时显示持续错误，不丢弃未知编码后拼成正常路径。刷新期间禁止使用缓存候选提交，失败可重新核实并保留未提交的级联草稿。只有完整核实的路径才触发选择回调；清空及选择回调显式包含五个编码键，未选层级为 `undefined`，确保表单以对象合并接收时也能清除旧编码。外部替换受控地址会同步重置打开的草稿；查询失败不会自动清空原地址。

服务端创建和更新会拒绝过滤后为空的拼音码；修改上级及启用时重新核对不可变行政编码的层级和上级前缀。创建、修改或启用有效子级要求全部祖先启用；停用记录可在停用上级下继续维护，但启用需先启用上级。拒绝的写入不改变记录修订或后代完整路径，普通改名仍在事务内刷新后代路径。

## 临床业务主数据远程检索

诊断、药品和诊疗项目的可选数据量较大，不得使用普通 `Select` 在页面打开时拉取完整目录。统一使用 `ClinicalResourceSearch`：组件只在用户输入后发起查询，默认防抖 250ms，每次最多展示 30 条；较晚返回的旧请求不会覆盖当前结果。

结果固定使用左侧名称、右侧浅色编码，名称下方可显示标准体系、项目类型、剂型/规格和必要的风险标签。每次返回后第一条可用记录自动高亮，搜索框保持焦点时可直接按回车选择。诊断检索支持术语库维护的拼音码和别名；药品检索支持通用名、编码、别名、剂型与规格；诊疗项目支持名称、编码、项目类型及机构本地名称/编码。

```tsx
import { ClinicalResourceSearch, type ClinicalResourceOption } from '../../shared/ui'
import type { DiseaseConcept } from '../../shared/api/masterDataApi'

const [diagnosis, setDiagnosis] = useState<ClinicalResourceOption<DiseaseConcept>>()

<ClinicalResourceSearch<DiseaseConcept>
  api={api}
  resource="diagnosis"
  value={diagnosis}
  onChange={setDiagnosis}
/>
```

`resource` 可取 `diagnosis`、`medication`、`service`。需要按当前机构限制诊疗项目或药品时传 `organizationId`；需要进一步限制“可开立”等业务条件时传稳定的 `filterResult` 函数。业务保存主数据 ID 或标准编码，名称和辅助信息只用于界面展示。

### 临床资源查询的失败与上下文边界

`ClinicalResourceSearch` 的诊断、药品、项目及组套查询必须返回真实数组，条目必须具有唯一 ID、编码和名称。接口失败、缺少所需 API、结构无效和混合查询任一来源失败均进入错误状态，不显示空结果或部分成功结果供选择。

拼音补充匹配只在关键词请求成功且结果为空时进行；补充查询重新调用相同机构／就诊上下文的真实目录接口，失败直接报错，不使用模块级候选池或过期缓存。临床搜索不缓存已完成的关键词结果，API 会话、机构、就诊或资源类别切换会隔离查询状态。

底层 `RemoteSearchSelect` 提供持续错误提示与“重新检索”，重试保留原查询。`cacheResults` 默认 `true` 以保留普通选择器的既有行为，临床资源入口固定为 `false`；加载函数变化会清除缓存，过时请求和禁用期间的选项不得触发选择。错误状态与“未找到匹配结果”分开。

搜索卡片的单价仅采用当前日期有效且已启用的销售价格；按真实币种、产品和包装单位分别显示，当前机构价格优先于同一包装的租户价格，不跨币种或单位计算价格区间，不将微小金额四舍五入为零。价格、作用域、有效期或包装关联缺失时显示待确认，实际无适用价格时显示暂无有效销售价。缺失药品类型不再归为西药，未知库存不显示缺药或虚构包装单位，缺失组套明细不计为零项并禁止选择。

服务列表接口先匹配完整租户目录，再限制最多 500 条匹配结果；视图关联数据按批次读取，避免第 500 条之后的项目被提前排除。`ServiceCatalogSearchCompletenessTest` 用超过 500 条真实持久化记录验证精确编码、名称检索及结果上限。

搜索与展示事实校验在本组件中完成；处方选中后的包装、服务销售价和单据小计校验见 `features/outpatient/orders/README.md`。组套展开也通过该领域模块重新核查；组套维护端、服务端其他目录／分页查询与实际计费链仍需继续逐项审计。

## 树形面板

树形面板接收扁平节点数据，通过 `id` 和 `parentId` 组织层级。业务模块负责权限、保存、删除确认和服务端校验，组件负责一致的展示与交互。只有传入对应回调时，新增、编辑、删除和排序按钮才会出现。

拖拽排序会通过 `onMove` 返回目标父节点与同级位置；业务端应将本次变更作为一个完整事务保存，避免逐条更新导致顺序只保存一半。进入排序模式后也可使用 `Alt + ↑/↓` 调整同级顺序、`Alt + →` 移入前一个同级节点、`Alt + ←` 移出当前父节点。

`TreePanelMove.index` 指目标同级列表在移除源节点之前的插入位置；同父级后移时业务端移除源节点后需扣减一位。键盘与拖拽遵循相同约定。

```tsx
import { TreePanel, type TreePanelMove } from '../../shared/ui'

const nodes = categories.map((item) => ({
  id: item.id,
  parentId: item.parentId,
  label: item.name,
  secondaryText: item.code,
  keywords: [item.code, item.description ?? ''],
}))

<TreePanel
  title="参数目录"
  rootLabel="全部分类"
  nodes={nodes}
  selectedId={selectedId}
  onSelect={setSelectedId}
  onAdd={(parentId) => openCreate(parentId)}
  onEdit={openEdit}
  onMove={(move: TreePanelMove) => saveTreeOrder(move)}
/>
```

节点行必须保持真实树语义和键盘可达。业务页面不得把缩进空格拼进名称，也不得用扁平按钮列表模拟树。

`headingLevel` 可选 2 或 3（默认 3），用于匹配页面标题层级；`searchLabel` 设置搜索框的可访问名称（默认“搜索树节点”）；`rootMeta` 可显示全部业务记录数，未传时显示节点数。参数分类使用这些属性保留“全部参数”的计数与搜索入口。

## 开发约束

- 颜色、字号、间距、圆角、阴影和层级只使用 `styles/tokens.css` 中的语义令牌。
- 公共样式进入 `styles/components.css` 或 `styles/layout.css`；业务专用布局进入 `styles/features/<领域>.css`（如 `outpatient-doctor.css`），或与功能目录同置的样式文件。
- 新的通用模式在第二个业务模块复用前必须提炼为共享组件。
- 异步功能必须覆盖加载、空、失败、无权限和成功反馈。
- 提交型 `Button` 必须显式设置 `type="submit"`；其余按钮默认 `type="button"`。
- 有未保存内容的 `Dialog` 应设置 `closeOnBackdrop={false}`。

提交前执行：

```bash
npm run check
```

该命令先执行规则回归测试、原有全量 UI 门禁和新增规则检查，再运行前端测试、TypeScript 与生产构建。新增规则的历史基线不豁免原有门禁。例外与人工验收要求见前端开发入口。

病历连续文书可使用 `FormField appearance="document"`，保留标签、错误关联及键盘焦点，正文随内容增长。`Dialog presentation="drawer" boundary={contentElement}` 覆盖指定内容区并跟随尺寸变化；未传 boundary 时覆盖视口。沿用焦点约束与恢复，有草稿时设置 `closeOnBackdrop={false}`。

`AnnotatedTextarea`：带来源片段的连续文本字段，正文字符串是唯一保存/复制来源，`annotations` 只标注精确区间；悬浮查看说明、点击非模态浮层调整/移除，Enter 进入全文编辑、Escape 关闭浮层。`showAnnotations` 仅切换显示；禁用或只读时不能修改。与 FormField 配合时提供 aria-label。
