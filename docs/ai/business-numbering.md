# 业务编码配置与接入清单

一期交付文件配置、平台通用生成器和展示/打印业务编码走查。既有业务号生成入口尚未切换，历史号保留；下表是后续接入清单，配置存在不表示入口已迁移。截图的结算单号沿用发票号，门诊号目前由挂号、转科两个入口生成。

## 配置与调用

默认配置是 [business-numbering.yml](../../backend/src/main/resources/business-numbering.yml)，由 application.yml 导入并随应用打包。使用已有 Spring 配置机制，启动时校验并冻结配置，不创建数据库配置表或运行时编辑接口。外置 YAML 可以通过 `--spring.config.additional-location=file:/path/business-numbering-override.yml` 覆盖单个规则；文件修改在重新启动发布后生效。

```yaml
rhn:
  business-numbering:
    redis-key-prefix: rhn:business-number
    zone-id: Asia/Shanghai
    rules:
      outpatient-encounter:
        prefix: OP
        suffix: ""
        date-format: yyMMdd
        sequence-width: 5
        scope: TENANT
```

每条规则省略字段时默认：空前/后缀、短日期 `yyMMdd`、5 位序列、租户级。允许 `yyyyMMdd` 长日期，也接受需求中的 `yymmdd` / `yyyymmdd` 写法；程序归一化为 Java 日期格式。号码为 `前缀 + 日期 + 左补零序列 + 后缀`，2026-10-11 的第一个号码为 `OP26101100001`，长日期为 `OP2026101100001`。序列每天从 1 开始，按配置时区计算业务日；不会截断或循环序列。前后缀各最多 16 个 ASCII 字母、数字、点、下划线、斜杠或连字符，序列宽度为 1–12。为避免短年份跨世纪重号，业务日限定在 2000–2099。

跨领域仅依赖 `com.rhn.platform.numbering.api`，复用既有 platform 模块公开 API 规则：

```java
// 注入 BusinessNumberGenerator，当前操作者所属租户/机构/科室。
String number = numbers.next("outpatient-encounter");
// 转科、后台任务按业务归属传入目标上下文；调用者先验证归属及权限。
String targetNumber = numbers.next("outpatient-encounter",
        new BusinessNumberContext(tenantId, targetOrganizationId, targetDepartmentId));
// 格式预览不会消耗 Redis 序列，也不代表已预留号码。
String example = numbers.preview("outpatient-encounter", LocalDate.of(2026, 10, 11), 1);
Map<String, BusinessNumberRule> configuration = numbers.rules();
```

| 级别 | Redis 计数隔离边界 | 必需上下文 |
| --- | --- | --- |
| SYSTEM 全系统 | 业务类型 + 全系统 + 业务日 | 显式调用可不传上下文 |
| TENANT 租户 | 业务类型 + 租户 + 业务日 | 租户 |
| ORGANIZATION 机构 | 业务类型 + 租户 + 机构 + 业务日 | 租户、机构 |
| DEPARTMENT 科室 | 业务类型 + 租户 + 机构 + 科室 + 业务日 | 租户、机构、科室 |

例如 `rhn:business-number:outpatient-encounter:tenant:1:20261011`。Redis key 中始终使用完整日期，修改显示日期、前后缀和宽度不重置已用序列。不同业务类型即使前缀相同也有独立计数，号码的唯一性要结合业务类型和所选级别判断。

## 并发和接入约束

使用现有 `StringRedisTemplate`，单 key Lua 原子完成容量检查和 `INCR`；无需新增运行依赖。参考 [Redis INCR](https://redis.io/docs/latest/commands/incr/) 与 [Lua 原子执行](https://redis.io/docs/latest/develop/programmability/eval-intro/)。计数 key 不设置过期，防止时钟回拨或迟到请求重建旧日序列。生产 Redis 需启用可靠持久化、备份及 `noeviction`，计数不能被删除、逐出或回滚，否则存在重号风险。

Redis 不可用返回 `BUSINESS_NUMBER_UNAVAILABLE` / 503；容量用尽返回 `BUSINESS_NUMBER_EXHAUSTED` / 409；缺少上下文或未知规则返回明确错误。不会降级到内存/随机号。取号和业务事务无法跨 Redis/数据库原子提交，失败允许留下跳号；禁止退还、递减或复用已取序列，不能作为财务连续号保证。

收费明细的 `docNo` 还存在 `requestCode / sourceId / id` 展示回退（BillingWorkspace），后续须先映射到原始业务号，不能为显示而重复取号。发票入口目前以 `invoiceNo` 同时承担幂等重放/前端待提交状态匹配（BillingApplicationService、completionBillingWrites），迁移时须先分离命令键与展示号。

接入时在现有幂等检查之后取号，一次持久化，并在重试时返回已持久化的原号。号码由服务端生成，主键仍按 [雪花标识规范](../architecture/架构决策-005-雪花算法标识.md) 使用 `GlobalIds`。前端 UUID 请求号继续承担幂等功能，不能直接把展示号码当作新请求号。

切换级别之前核对实体唯一约束与查询合同。例如门诊号当前按租户唯一，机构/科室级独立序列可能产生相同显示值；这种入口接入时须采用可区分归属的前后缀/分机构规则或先调整唯一性与查找合同。不能仅缩小 Redis 计数边界就认为满足原来的租户唯一约束。`scope`、业务 key、Redis 前缀及时区在已有号码后变更须做发布切换评估。现有外部票号、医保号和历史打印快照不重算。

## 全域走查

扫描了所有后端模块业务号赋值及前端展示、操作、打印入口；下面列出内生/派生业务号的默认规则，共 45 项。当前既有入口的生成方式为走查结果，文件前缀是通用工具的初始值。`settlement` 为预留独立结算号规则，当前结算沿用 `invoice`，接入时只取一次，不能无条件拆成两套。

| 配置 key | 业务 / 文件前缀 | 当前来源 / 生成入口 |
| --- | --- | --- |
| resident-record | 居民档案 / RHN | ResidentService，时间戳 + 随机字符；居民中心及临床打印 |
| outpatient-encounter | 门诊就诊 / OP | EncounterService、OutpatientReferralService，时间戳 + 随机字符；门诊/收费/打印 |
| outpatient-appointment | 预约 / AP | RegistrationEntities，AP + 雪花 ID |
| outpatient-registration | 挂号 / RG | RegistrationEntities，RG + 雪花 ID；挂号、收费 |
| outpatient-triage | 预检 / TR | OutpatientTriageService，日期 + 雪花取模 |
| outpatient-referral | 会诊转科申请 / RF | OutpatientReferralRequest，RF + 雪花 ID |
| medication-request | 药品医嘱 / MR | MedicationRequestService，时间戳 + 随机字符 |
| service-request | 检查检验及治疗医嘱 / SR | ServiceRequestService，时间戳 + 随机字符；申请单打印 |
| prescription | 处方 / RX | PrescriptionService，时间戳 + 随机字符；处方打印 |
| inpatient-episode | 住院次 / IP | InpatientApplicationService，日期 + 雪花尾 8 位 |
| inpatient-encounter | 住院就诊 / IPE | InpatientApplicationService，同上 |
| inpatient-care-request | 住院医嘱 / IP | InpatientCareRequestStore，同上；护理/给药单打印 |
| inpatient-deposit | 预交金凭证 / IPD | InpatientWorkspace 前端日期/就诊 ID 拼接，后端校验传入 |
| invoice | 发票/计费单 / INV | BillingWorkspace、completionBillingWrites 前端 UUID；收费结算打印 |
| settlement | 独立结算号（预留）/ ST | SettlementApplicationService，当前复用 invoiceNo |
| payment-order | 支付订单 / PO | PaymentOrderTransactionService，时间戳 + 随机字符 |
| refund-order | 退款订单 / RO | PaymentOrderTransactionService，同上 |
| payment | 收款凭证 / PAY | PaymentResultTransactionService，PAY- + 支付订单号；也允许旧接口传入 |
| refund | 退费凭证 / RF | PaymentResultTransactionService，RF- + 退款订单号；住院拆分退费由命令号派生 |
| receipt | 电子票据内部号 / RC | Receipt，RC + 雪花 ID；外部财政票号另记 |
| insurance-claim | 医保内部业务 / IC | InsuranceClaim，IC + 雪花 ID；外部医保结算号另记 |
| cashier-close | 收费员结账 / CC | CashierCloseApplicationService，时间戳 + 随机字符 |
| cashier-reopen | 结账重开 / CR | CashierCloseApplicationService，同上 |
| reconciliation-batch | 资金对账批次 / RB | ReconciliationTransactionService，同上 |
| treatment-task | 治疗执行 / TX | TreatmentExecutionTask，时间戳 + 随机字符；执行单及打印 |
| diagnostic-task | 检查检验执行 / DX | DiagnosticExecutionTask，DX- + 申请号 |
| stock-purchase-order | 采购 / PO | InventoryOperationApplicationService，默认时间戳 + 随机字符，可传入 |
| stock-goods-receipt | 到货 / GR | InventoryOperationApplicationService，同上 |
| stock-transaction | 库存流水 / IT | InventoryApplicationService，时间戳 + 随机字符 |
| stock-transfer | 调拨 / TR | StockTransferApplicationService，默认时间戳 + 随机字符，可传入 |
| stock-requisition | 请领 / REQ | StockRequisitionApplicationService，同上 |
| stock-count | 盘点 / CT | StockCountApplicationService，同上 |
| stock-price-adjustment | 调价 / PA | InventoryPriceAdjustmentApplicationService，时间戳 + 随机字符 |
| stock-period-close | 库存期结 / PC | InventoryPeriodCloseApplicationService，同上 |
| stock-reconciliation | 库存对账 / REC | InventoryReconciliationApplicationService、InventoryPeriodCloseApplicationService，同上，需共享同一规则 |
| medication-supply-batch | 住院药品供给批次 / MS | WardMedicationSupplyApplicationService，时间戳 + 随机字符 |
| pharmacy-dispense-task | 发药任务 / DT | PharmacyApplicationService，同上 |
| pharmacy-review | 药房审方 / PR | PharmacyApplicationService，同上 |
| pharmacy-return | 药房退药 / RET- | usePharmacyWorkspace 前端拼接 RET-任务号-时间戳，DispenseApplicationService 校验传入 |
| ward-delivery | 病区配送 / WD | WardDeliveryApplicationService，当前要求传入；IPMS-WD-批次-分段为派生编号 |
| ward-medication-return | 病区退药 / WMR | WardMedicationReturnRequest，WMR + 雪花 ID；分组退药凭证由申请号派生 |
| schedule-resource | 排班资源 / SR- | SchedulingEntities，前缀 + 雪花 ID，资源管理展示 |
| schedule-template | 排班模板 / ST- | SchedulingEntities，同上 |
| schedule | 排班 / SCH- | SchedulingEntities，同上 |
| schedule-slot-pool | 号源池 / SP- | SchedulingEntities，同上 |

归属明确后再接入，特别是转科号取目标机构/科室，而非当前发起者；库存单据按持有机构/库房的领域合同选择级别。`PO`、`TR`、`IP`、`RF`、`SR` 在多个业务中已经复用，不能按字符串前缀推断业务类型。

以下展示/打印编码有其他权威来源，不能用本工具覆盖：

| 类别 | 例子 / 当前合同 |
| --- | --- |
| 外部业务凭证 | 财政票号/红字票号、医保预结算/结算号、支付平台订单/交易号、LIS/RIS 报告号；mock 返回值同样模拟外部合同 |
| 外部识别号 | 身份证/证件号、医保成员号、药品追溯码、厂家批号、供应商送货单号、标本号；来自采集或输入 |
| 主数据稳定代码 | 机构/科室/人员、药品/项目/套餐/库位/库房、诊断 ICD、字典代码、接口/规则/模板业务代码；已有维护或标准映射合同 |
| 排队短号 | QueueingApplicationService，队列前缀 + 当前营业日数据库锁计数，与 queue.sequenceNo 及叫号顺序联动；迁移前保留其队列/营业日与顺序语义 |
| 技术与派生标识 | 数据库主键、requestCode/commandCode/幂等 UUID、追踪/消息/版本号、行序号、IPMS-DSP-批次-任务、LOCAL-申请号及 LOCAL-RPT-任务-V版本；关联原始事实，不独立换号 |

扫描入口包括后端 `rhn-*/src/main/java` 的号字段赋值、前缀/日期/随机号/ID 拼接，以及前端 `features`、打印数据 provider 与 PDF renderer。主数据代码、外部号、技术号按上面的合同归类，避免把“界面上有编码”理解成“全部可以自主重编”。

## 验证

`ConfiguredBusinessNumberGeneratorTest` 覆盖默认配置绑定、OP 示例、长短日期、前后缀、级别隔离、跨日与时钟回拨、格式变更不重置、缺失上下文、配置错误、容量和不可用错误。

`RedisBusinessNumberCounterIntegrationTest` 用 `RHN_NUMBERING_TEST_REDIS_EXECUTABLE=/absolute/path/redis-server` 指向测试二进制；测试自行启动随机端口实例，退出时只停止自身进程，不使用人工 Redis。验证两个客户端 400 次并发唯一、应用实例重建后连续、容量临界并发、12 位上限和损坏计数不重置。未设置变量时该真实 Redis 测试明确跳过；配置/生成器测试照常执行。
