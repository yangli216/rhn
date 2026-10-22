# 桌面宿主适配层

RHN 页面可能运行在普通浏览器，也可能运行在 [RHN Link（健域端联）](https://github.com/yangli216/rhn-link) 受控业务窗口中。本目录只负责判断宿主并给出插件调用入口，业务行为由各领域按需接入。

- `detectDesktopHost()` / `getDesktopHost()`：读取宿主注入的 `window.ssdevDesktop`，校验 `getSystemInfo()` 声明和桥接协议版本，结果为 `browser`、`unsupported`（带稳定 `reason`）或 `rhn-link`。
- `useDesktopHost()`：React 入口；检测完成前和失败时都返回 `browser`。
- `rhn-link` 结果提供与 SDK `PluginInvoker` 同形的 `invoker`；持久调用可用时（`trackedInvocations === true`）额外提供同形的 `trackedInvoker`（`invokePluginTracked` / `getPluginInvocation`），不可用时该字段不存在。

约定：

- `browser` 与 `unsupported` 一律保持现有浏览器行为，不尝试 localhost HTTP、WebSocket 或其他回退通道。
- 业务组件不直接访问 `window.ssdevDesktop`，统一经过本目录。
- 打印、写卡等非幂等操作只能在 `trackedInvocations === true` 时经 `trackedInvoker` 走桌面插件，并按 rhn-link `docs/tracked-invocations.md` 持久保存 operation ID；不可用时回退浏览器流程，不退回普通 `invokePlugin`。
- 插件返回码不在业务代码中散落魔法数字；接入具体插件时再引入 SDK 分类函数或在此集中定义。
- SDK 已更名为 `@rhn/link-web-bridge`（0.2.0，分发方式见 rhn-link `docs/rhn-deployment.md`）；vendor 引入后，`detectDesktopHost()` 内部改为 `connectDesktop()`，对外类型保持不变。

## 工作站打印

- `rhnPrinting.ts`：`rhn.printing` 插件契约（`ResData = { ReturnValue, result }`），把响应和持久调用状态归为“已提交 / 保证未执行 / 结果不确定”；`pending` 只查询同一操作，不重放。
- `desktopPrintDelivery.ts`：`printReceipt()` 是受控输出的统一打印入口。`BROWSER_PDF` 调起浏览器预览、`LOCAL_BRIDGE` 交给本地打印桥，均保持原有行为；`DESKTOP_LINK` 先在后端保存操作编码，再调用插件并回写结果，不在 RHN Link 中时登记浏览器回退。
- `useReceiptPrinter` + `ReceiptPrintStatus`：打印弹窗使用，记住投递最新版本，展示结果并提供人工核对（结果不确定时必须先核对，判定未出纸须填写说明）。
- 院内 HTTP 部署不是安全上下文：操作编码退回 `getRandomValues` 生成，本地摘要复核在没有 SubtleCrypto 时跳过（插件仍按摘要校验同一份字节）。
