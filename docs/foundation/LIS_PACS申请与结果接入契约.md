# LIS/PACS 申请与结果接入契约

## 1. 本轮边界

RHN 保有临床申请、交换追踪、诊断报告和结构化观察结果的主事实，不在首期自建 LIS/PACS 的标本条码、采样工作站、检验仪器通讯、影像排程、设备控制、DICOM 归档和阅片工作站。外部适配器通过稳定 HTTP 契约读取待发送申请、登记传输结果、回传业务回执与报告。

首批支持：

- `LABORATORY` 检验申请进入 LIS 逻辑端点，报告至少包含一项结构化观察结果；
- `EXAMINATION` 检查申请进入 PACS 逻辑端点，最终报告必须包含结论；
- 传输成功/失败与业务接收/拒绝分离，避免把“HTTP 已发送”误认为“外部系统已受理”；
- 相同端点、方向和业务消息号构成幂等键；相同负载重复请求返回既有事实，不同负载失败关闭；
- 报告按外部报告号连续追加版本，更正和取消版本显式引用上一版本，不覆盖历史结果。

## 2. 与表结构梳理模型的对应

| 目标模型 | 当前实现 | 说明 |
|---|---|---|
| `ex.care_request` / `ex.service_request` | `care_requests` / `service_requests` | 申请主事实；V28 增加项目类型、标本类型和检查类型快照 |
| `int.external_message` | `external_messages` | 收发方向、幂等业务消息号、负载摘要、交换状态和业务资源关联 |
| `ex.diagnostic_report` | `diagnostic_reports` | 追加式初步、最终、更正或取消报告版本 |
| `vis.observation` | `observations` | STRING、NUMBER、BOOLEAN、CODE、DATETIME 五类强类型观察值 |
| `ex.diagnostic_report_result` | `diagnostic_report_results` | 报告与观察结果的有序关联 |

报告和观察结果不回写申请快照。申请撤销也不删除已经接收的结果；如外部执行已发生，后续到达的报告仍作为临床事实保留，并由报告状态表达有效性。

## 3. 状态模型

外发消息：

```text
PENDING → SENT → ACKNOWLEDGED
   │        └──→ REJECTED
   └──→ FAILED ──重试──→ SENT
```

- `SENT` 仅代表适配器报告传输成功；
- `ACKNOWLEDGED` 才表示 LIS/PACS 业务受理；
- `REJECTED` 保存外部错误码和说明；
- 已确认或已拒绝的消息不能反向修改传输状态。

入站消息使用 `RECEIVED → PROCESSED`。报告入库、观察结果、消息业务关联和领域事件处于同一事务；业务处理失败时不留下“已接收但无结果”的半成品。

报告版本：首版必须为 1；后续必须严格为当前最新版本加 1。后续版本不能再次声明为 `PRELIMINARY`。检验更正结果生成新的观察事实，旧观察结果只由旧报告版本引用。

## 4. 接口

| 接口 | 调用方 | 用途 |
|---|---|---|
| `POST /api/integration/diagnostics/requests/{requestId}/outbound-messages` | 临床/编排层 | 将生效的检查检验申请放入指定逻辑端点队列 |
| `GET /api/integration/diagnostics/outbound-messages` | 外部适配器 | 按当前机构科室、端点和状态读取最多 100 条外发消息 |
| `POST /api/integration/diagnostics/outbound-messages/{messageId}/delivery` | 外部适配器 | 登记传输成功或失败，不代表业务受理 |
| `POST /api/integration/diagnostics/inbound/acknowledgements` | LIS/PACS 适配器 | 回传业务接收或拒绝结果 |
| `POST /api/integration/diagnostics/inbound/reports` | LIS/PACS 适配器 | 幂等接收报告版本和结构化观察结果 |
| `GET /api/encounters/{encounterId}/diagnostic-reports` | 临床工作台 | 查询本次就诊报告及版本 |
| `GET /api/service-requests/{requestId}/diagnostic-reports` | 临床工作台 | 查询单个申请的报告版本链 |

所有接口必须携带租户与受信工作机构、科室上下文。当前基础认证用于开发联调；生产适配器必须配置独立机器身份、最小权限、双向 TLS 或签名验签，不能复用医务人员账号。

## 5. 负载与结果门禁

外发申请包含申请号和修订号、居民/就诊标识、项目和机构本地编码、项目类型、标本/检查类型、数量、临床说明、执行机构科室、扩展属性快照及标准映射快照。适配器不得重新读取当前主数据覆盖这些开立时点事实。

入站报告必须满足：

1. 申请属于当前租户及机构科室数据范围，且项目类型为检查或检验。
2. 报告类型与申请一致：`LABORATORY` 对检验，`IMAGING` 对检查。
3. 业务消息号与内容 SHA-256 摘要满足幂等约束。
4. 报告版本连续；相同报告版本不能通过更换消息号绕过覆盖保护。
5. 每项观察结果必须且只能填写与值类型对应的一个值；参考范围下限不得大于上限。
6. 检验报告必须有结构化结果，影像报告必须有结论；取消报告不能携带观察结果。

## 6. PC 工作台

门诊“诊疗项目开立”表格显示项目类型、标本/检查要求、交换状态和最新报告状态。检查检验申请可发送到 LIS/PACS 逻辑端点；最新报告以双列卡片显示结论、结构化数值、参考范围、异常提示、版本和摘要。更正报告展示为新版本，不隐藏原报告历史。

## 7. 生产前待办

- 建立逻辑端点到具体厂商、协议和机构路由的参数化配置，不把厂商 URL 写入业务模块；
- 完成机器身份、IP/证书绑定、消息签名验签、可信时间戳和报文静态加密；
- 增加队列租约、并发领取、退避重试、死信处置、监控指标和人工补偿工作台；
- 明确 HL7 v2、FHIR、厂商 JSON、DICOMweb 等适配器映射及权威编码版本；
- 对危急值建立单独的通知、确认、升级和闭环时限，不仅依赖普通报告展示；
- 接入报告附件、影像索引/WADO 链接时只保存受控引用，不在业务库复制 DICOM 大对象。
