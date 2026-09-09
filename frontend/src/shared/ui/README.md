# RHN 共享 UI 使用说明

业务模块统一从 `shared/ui` 引入公共组件，不复制通用结构或交互行为。

## 组件清单

| 组件 | 用途 | 已内建能力 |
|---|---|---|
| `Button` | 主、次、文字、危险操作 | 尺寸、禁用、稳定加载态、重复提交防护 |
| `IconButton` / `Icon` | 功能图标和装饰图标 | 统一 SVG、可访问名称、交互目标尺寸 |
| `PageHeader` | 一级页面标题区 | 眉题、唯一 H1、描述、操作区；PC 维护页支持紧凑模式 |
| `Panel` / `PanelHead` | 任务或信息集合 | 统一表面、标题层级、元数据位置 |
| `Tabs` | 页面或工作区页签 | 线性、工作区和卡片三种规范变体；自动处理 ARIA、方向键、Home/End 与焦点移动 |
| `SearchField` | 列表和主数据检索 | 统一搜索图标、清空操作、焦点状态与可访问名称 |
| `SplitWorkspace` | 左侧目录、右侧详情的主从页面 | 统一最小尺寸、间距和溢出边界，业务仅配置列宽 |
| `TableShell` / `DataTable` | 数据列表与表格 | 统一滚动容器、表头、行密度、悬停和底部统计区 |
| `Pagination` | 长列表分页 | 上一页、下一页、页码播报和边界禁用状态 |
| `FormField` | 表单字段 | 标签绑定、错误关联、提示和统一控件样式 |
| `Select` | 通用下拉选择 | 单选、多选、名称/值/拼音首字母检索、清空、键盘操作、表单提交 |
| `DictionarySelect` | 字典下拉选择 | 按字典编码或 ID 加载启用项、名称/编码/拼音检索、编码展示、缓存及单选/多选 |
| `GridAddressInput` | 标准网格地址录入 | 单字段级联选择，支持省市县 3 级或省市县街道社区 5 级、12 位区划代码/名称/拼音码检索 |
| `RemoteSearchSelect` | 大规模主数据远程检索 | 输入后防抖请求、竞态保护、结果缓存、首项高亮、回车选择、辅助摘要与编码展示 |
| `ClinicalResourceSearch` | 临床业务主数据检索 | 通过 `resource` 配置诊断、通用药品或诊疗项目，统一适配接口和结果文案 |
| `FormSelect` | 表单下拉适配 | 与 React Hook Form 的 `control`、字段值和校验状态集成 |
| `TreePanel` | 分类、目录和层级对象维护 | 检索、展开/收起、选中、增改删操作插槽、拖拽与键盘排序、层级调整 |
| `Alert` | 全局提示反馈 | 顶部向下浮现、自动关闭、手动关闭、消息堆叠、error/warning/success/info 语义与读屏播报 |
| `StatusBadge` | 业务状态 | success/info/warning/danger/neutral 语义色 |
| `LoadingState` / `EmptyState` | 异步区域状态 | 状态播报、统一空状态结构和可选操作 |
| `Dialog` | 单任务弹窗 | 焦点约束、Escape、焦点恢复、滚动锁定 |
| `ObjectContextBar` | 居民、患者等对象上下文 | 身份、关键事实和主操作的统一位置 |
| `BackButton` | 返回上层任务 | 统一图标、尺寸与焦点状态 |
| `Switch` | 开关选择 | 遵循 ARIA switch 语义规范，支持键盘 Space/Enter 操作、受控/非受控、sm/md 尺寸与随动状态说明 |

业务枚举的文案和颜色不能写在功能组件中，应集中到 `shared/presentation.ts`，再传给 `StatusBadge`。

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

PC 端配置、基础数据和平台管理页面默认使用 `compact`。工作区 Tab 已承担当前页面识别，紧凑标题中的眉题、标题和说明只保留语义结构、不重复显示；存在主操作时仅显示操作区，并优先与页面内分类 Tab 合并。所有模块的 `PageHeader` 均吸附在主内容滚动区顶部，标题与主操作在长页面滚动时保持可见，但不固定到浏览器页面，也不与分类 Tab 叠加形成双层吸顶。带模块标题的页面顶部不保留可滚动空白，标题初始位置和吸顶位置必须一致。长列表页面应固定分类、筛选和操作区，仅让数据列表容器内部滚动；列表表头在滚动容器内保持可见。移动端或强调叙事与引导的页面可继续使用默认标题模式。

平台管理页面不得自行用 `role="tablist"`、搜索输入框外壳或裸表格复制上述交互。业务差异通过 `Tabs` 的变体、组件 `className` 的布局修饰和表格单元格内容表达，不重复定义边框、圆角、焦点环、键盘行为或滚动规则。

所有跨区域的成功、失败、警告和一般提示统一使用 `Alert`。组件默认挂载到当前工作页的顶部浮层，从上向下依次出现，不参与内容区布局；成功提示默认显示 4.5 秒，普通提示 5 秒，警告和错误 8 秒。需要延长、持续显示或在关闭后同步业务状态时，分别使用 `duration`、`duration={null}` 和 `onDismiss`，不要在业务模块内另建 Toast。

```tsx
<Alert tone="success">保存成功</Alert>
<Alert tone="warning" duration={10_000}>库存即将不足，请及时补货。</Alert>
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

## 树形面板

树形面板接收扁平节点数据，通过 `id` 和 `parentId` 组织层级。业务模块负责权限、保存、删除确认和服务端校验，组件负责一致的展示与交互。只有传入对应回调时，新增、编辑、删除和排序按钮才会出现。

拖拽排序会通过 `onMove` 返回目标父节点与同级位置；业务端应将本次变更作为一个完整事务保存，避免逐条更新导致顺序只保存一半。进入排序模式后也可使用 `Alt + ↑/↓` 调整同级顺序、`Alt + →` 移入前一个同级节点、`Alt + ←` 移出当前父节点。

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

## 开发约束

- 颜色、字号、间距、圆角、阴影和层级只使用 `styles/tokens.css` 中的语义令牌。
- 公共样式进入 `styles/components.css` 或 `styles/layout.css`；业务专用布局进入 `styles/features.css`，后续规模增大时按领域拆分。
- 新的通用模式在第二个业务模块复用前必须提炼为共享组件。
- 异步功能必须覆盖加载、空、失败、无权限和成功反馈。
- 提交型 `Button` 必须显式设置 `type="submit"`；其余按钮默认 `type="button"`。
- 有未保存内容的 `Dialog` 应设置 `closeOnBackdrop={false}`。

提交前执行：

```bash
npm run check
```

该命令会先执行 UI 规范门禁，再完成 TypeScript 与生产构建验证。
