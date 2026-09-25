# 前端 UI 开发入口

本文件只维护开发流程与导航；设计规则以 [UI 规范](../用户界面设计与开发规范.md) 为准，组件用法见 [shared/ui](../../frontend/src/shared/ui/README.md)。

存量治理记录见 [2026-09-22 首批整改](ui-debt-progress-2026-09-22.md)：原有门禁已恢复通过，后续保持新增违规为零，按模块继续缩减历史基线。

## 开始前

1. 按 [模块索引](module-map.md) 定位业务；新页面必读 UI 规范第 5、10、11、12 节，以及本次控件对应的第 6/7 节。
2. 读组件目录，选择 [可运行页面模板](../../frontend/src/shared/ui/templates/README.md)。确认现有组件 API 后再写 JSX，不能根据名称猜 props。
3. 在进度说明中记录：`页面类型 / 模板 / 共享组件 / 主操作 / 滚动归属 / 必要例外`。这是开发者自行完成的设计判断，不是逐页审批流程。

## 选型

| 用例 | 模板 | 组件组合 |
| --- | --- | --- |
| 查询、结果列表 | `ListPage` | SearchField + DataTable + Pagination；固定筛选/操作，表格局部滚动 |
| 分类、目录与详情维护 | `MasterDetailPage` | TreePanel 或列表导航 + 详情；左右独立阅读区 |
| 队列、临床作业与参考信息 | `WorkbenchPage` | 队列 + 主作业 + 辅助信息；三栏在较小可用宽度下改为两栏，辅助信息接在主作业之后 |
| 登记、新建、编辑 | `FormPage` | FormField + Select/DictionarySelect + 多列表单；底部单一提交操作 |

字典必须使用 DictionarySelect；大量诊断、药品、项目使用 ClinicalResourceSearch；普通固定选项使用 Select；RHF 适配用 FormSelect；连续录入使用 EditableTable；日期、数量单位和地址分别查 DatePicker、UnitNumberInput、GridAddressInput。状态映射放 shared/presentation，格式化使用共享函数。

## 参考页面的边界

以下是按源码选出的**局部参考候选**，未宣称已经由用户确认视觉验收：

- `features/settings/ParameterManagement.tsx`：参考分类—列表—详情的业务组织、TreePanel 调用；分类已接入共享树的搜索、选择和键盘操作，仍不作为整页视觉合规证明。
- `features/settings/OrganizationPersonnelManagement.tsx`：组织架构与人员任职已采用 `MasterDetailPage` 的 `WorkspacePane` 滚动边界；目录筛选和详情操作固定，正文独立滚动，关系表使用 `DataTable`。
- `features/settings/OperationalMasterDataPanel.tsx`：参考 TableShell/DataTable 的组合，不能复制其业务私有表格封装作为新的通用组件。
- `features/inpatient/InpatientDoctorStation.tsx`：参考工作区 Tabs 与业务分区组合，临床细节仍读领域入口。

2026-09-22 高频业务首轮收敛（待人工视觉验收）：

- `features/outpatient/RegistrationWorkspace.tsx`：可参考紧凑号源筛选、SearchField 快捷键与共享 DataTable；号源业务卡片、就诊介质和收款流程仍保留现有专用交互。
- `features/billing/BillingWorkspace.tsx`：可参考患者队列、费用明细与收银分栏；按实际内容宽度切换三栏/两栏，较窄桌面下明细与收款共用一个正文滚动区，长表仅局部横向滚动。
- `features/outpatient/DoctorWorkstation.tsx`：病历、诊断、医嘱与扩展工具标题回归共享 PanelHead，工具操作使用 Button；保留病历/医嘱既有业务结构及草稿协调，尚不作为整页合规参考。

这些页面本轮沿用 WorkbenchPage 的密度与分区原则，采用共享组件逐步迁移，并未替换为通用模板壳。原因是挂号有号源与真实收款、门诊有草稿防串患者及动态辅助面板，整体换壳需单独验证业务上下文与滚动。用户验收后再登记可作为整页参考的范围。

新页面的结构基准优先采用模板。用户后续认可某一实际页面时，在此登记页面、认可范围和日期；出现重复反馈时，把修正回收到模板或共享组件，而不是只修那一个页面。

## 样式和滚动边界

- 模板内建标题、分栏、留白和滚动容器。布局 CSS 随模板导入，业务不要重复粘贴。
- 页面外边距与工作台留白分开：普通 `.page` 使用 `--layout-page-gutter`（24px），高密度工作台主功能区使用 `--layout-workspace-gutter`（16px）。业务 CSS 不再自行叠加左右 24px/32px padding；医生站等确需扩大工作区的场景只能用令牌计算。
- 相邻面板横纵间距统一引用 `--layout-panel-gap`（8px），较大业务分组引用 `--layout-section-gap`（12px）。由父容器 gap 控制，子面板不得再叠加 margin；模板通过 `--page-header-gap: 0px` 消除标题间距重复。
- 字号按 UI 规范第 4.2 节的两档层级使用 `--font-size-*` 令牌；正文/表格为标准 14px、大字 16px，辅助信息为 12px/14px。新增页面必须兼容个人菜单的「标准 / 大字」切换，不能使用固定字号覆盖；不要把阅读字号、控件高度和打印尺寸混为一种全页缩放。
- 用户偏好紧凑的纵向密度：普通 Panel 标题复用共享的标准档 36px / 大字档 40px 最小高度；传入对象操作时统一增加到 40px / 44px，可使用 `sm` 次要按钮。标题过长时省略并优先保证操作区完整，不叠加大面积标题留白。具体规则以 UI 规范第 6.3 节为准。
- 普通表单只有一个正文滚动区；长列表固定工具区，只有 TableShell 或列表内容区滚动；主从/临床工作台允许有清晰边界的独立阅读区。同一栏不要再套第二个纵向滚动容器。页面超高时由页面工作区自身处理纵向滚动，外层 `.workspace-content` 不预留稳定滚动条空间。列表最小宽度需要横向滚动时，滚动归属内容区，不能让外层面板被宽表撑开，避免右侧出现重复页面留白。
- 列表默认填满页面剩余高度，空/少/多行共用稳定外框，行高不随外框拉伸。主从页使用 `navigationHeader` / `navigationFooter` 固定筛选与分页，`detailHeader` 固定对象与页签；正文滚动条从内容区起点到固定底部上方。内嵌 TableShell 时切换为 `detailScroll="content"`，关闭外层纵向滚动。完整高度链、条目密度和复位规则见 UI 规范第 5.4 节。
- 页面内上下文标题使用 H2，避免与 PageHeader 的唯一 H1 重复。旧 ObjectContextBar 当前输出 H1，组合前应评估共享组件改进，不能直接复制。
- PageHeader 的 compact 是紧凑模式，当前仍保留可见标题。不得根据旧说明自行隐藏标题或重复另建标题条。

## 检查与交付

从 frontend 目录执行：

```sh
npm run ui:policy:test       # 检查规则自身的回归测试
npm run ui:policy           # 新增规则 + 固定历史基线
npm run ui:policy -- --audit # 只读展开当前违规代码，便于追溯基线指纹（完整输出存日志）
npm run ui:check            # 原有全量规则 + 新增规则；已接入 CI / verify-scope
npm run test -- src/dev/PageTemplateGallery.test.tsx
npm run build
```

一般前端交付执行 `npm run check`；仅涉及已有领域逻辑时按根目录范围脚本验证。修改共享模板/组件要扩大至共享组件相关测试。完整日志写入 `.runtime/verification/`。既存失败应与改动前结果比较，不以更新基线或关闭规则解决。

人工验收入口：开发服务的 `/ui-templates.html`。使用虚构数据，不访问业务 API；不加入生产菜单或默认构建入口。在 1280/1440/1920px 下检查四种模板、长文本/长列表、加载/空/无结果/失败/无权限、键盘操作、表单失败保留输入、主操作与滚动边界。页面模板通过 TypeScript 和 DOM 测试仍需人工检查视觉；只有用户明确要求时才运行浏览器 QA。

交付简述：`采用的模板与组件；偏离及原因；通过/失败检查；待人工验证事项`。不要求给每个页面再增加一份长文档。

## 自动规则与例外

规则实现在 `frontend/scripts/ui-policy.mjs`，作用于 features 下的业务 TSX/CSS、styles/features 及 features.css、共享页面模板和 dev 演示；`.test` / `.spec` 文件不作为业务代码扫描。

- JSX 使用 TypeScript AST，识别跨行原生 button/select/table/dialog、手写 tablist、搜索框和内联视觉属性。
- CSS 使用 PostCSS，识别 !important、移动专属断点、覆盖共享控件外观、未使用令牌的颜色/字号/圆角/阴影/层级/间距。布局宽高不一刀切禁止。
- `ui-policy-baseline.json` 仅冻结规则引入前 Git HEAD 已存在的违规指纹与次数，并记录来源提交。文件路径或违规代码变化、同一指纹超出记录次数时会失败。已消除的条目应随迁移删除，避免旧额度被重新使用。它是技术债清单，不是合规证明，也不取代原有全量规则。
- 不提供自动“接受当前所有违规”的命令。迁移时可删除已消除的基线条目，不得将新增违规加入历史基线。
- 真实例外登记在 `frontend/scripts/ui-policy-exceptions.json`：精确文件、规则、指纹、次数、业务原因、负责人、到期日、回收条件。检查会拒绝过期/无效条目；不支持目录级豁免。特殊控件仍优先放入共享组件实现。
- 自动检查不能判断整体视觉质量、语义正确性或所有动态样式。代码审查与人工视觉验收仍负责这些部分。
