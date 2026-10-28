# 前端页面开发约定

新建页面或调整 UI 前，先读一页的 [UI 速查表](../docs/ai/ui-cheatsheet.md)（数值、选型、正反例、已确认偏好），再读 [开发入口](../docs/ai/frontend-ui.md)，再读其中对应的规范章节、组件和模板；不必通读全部业务页面。

- 编码前用一段进度说明明确：页面类型、选用模板、共享组件、主操作位置、滚动区域和必要偏离。无需为常规选型等待用户确认。
- 新页面从 `src/shared/ui/templates` 的四种模板组合开始。参考旧页面时仅复用入口文档明确标注的模式，不能把整页当作合规证明。
- 页面默认遵循“正文优先，布局紧凑，对齐工整”，按 [UI 规范第 2.7 节](../docs/用户界面设计与开发规范.md#27-用户偏好正文优先紧凑有序) 实现并主动自查，用户无需重复说明。
- `src/shared/ui/README.md` 是组件 API/用法导航；`../docs/用户界面设计与开发规范.md` 是设计规则来源。发现二者不一致时核对实现并同步文档，不能静默挑选更宽松的说法。
- 优先使用共享 Button、SearchField、Select/DictionarySelect/FormSelect、DataTable、Tabs、Dialog、EditableTable。普通文本 input/textarea 继续由 FormField 包装；不要求发明不存在的 Input 组件。
- 业务 CSS 负责布局，不重写共享控件的颜色、字号、圆角、阴影、焦点或禁用外观。尺寸、分栏宽度可按业务设置；视觉值使用语义令牌。
- 每改完一批前端文件立即运行 `npm run ui:files -- <文件...>`（Claude Code 已由 hook 自动执行），当轮修正违规，不留到交付验证。
- 改动共享组件、令牌、模板或全局样式后运行 `npm run ui:visual`；截图差异不经用户确认不得 `ui:visual:update`。
- 新的通用需求优先扩展共享组件。不要绕过门禁、更改历史基线或增加整目录白名单来让检查通过；真正例外按开发入口登记。
- PC 视口为 1280/1440/1920px，充分利用横向空间。默认不做移动端布局。沿用根目录规则：未经明确请求不做真实浏览器验证。
- 国际化预留：当前不引入 i18n 库，界面文案仍直接写中文，但新代码不要增加日后抽取的成本：
  - 日期、时间、数量、金额统一走 `src/shared/format.ts`、`src/shared/utils/dateRange.ts`、`src/shared/utils/precision.ts` 的格式化函数，业务代码不直接 `new Intl.*` 或 `toLocale*`；需要新格式时扩展共享函数。`ui:check` 的 `direct-locale-format` 规则强制此约定（测试文件与 `Intl.Collator`/`Segmenter` 除外）。
  - 含变量的句子用模板字符串整体表达（如 `` `共 ${count} 条` ``），不用多段 `+` 拼接，也不依赖中文语序拆句复用片段。
  - 共享组件的可见文案通过 props 传入或集中在组件内一处默认值，不散落在实现细节里。
  - 业务判断只看编码（字典 code、状态枚举、错误 `code`），不比较或 `includes` 展示文本与错误 `message`；存量按文本判断的实现在触及时改为按编码。
- 完成时报告模板/组件、例外、检查结果和未完成的人工验收。编译或 DOM 测试通过不等于视觉验收通过。日志保留在 `../.runtime/verification/`，不自动 commit/push。
