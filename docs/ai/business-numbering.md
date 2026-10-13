# 业务编码配置与接入清单

已提供文件配置、平台通用生成器和只读业务编码管理页。门诊相关 27 条规则已接入：就诊、预约、挂号、预检、转科申请、医嘱、处方、排班、执行、药房与收费凭证。历史号保留；下表明确标注已接入与未接入入口。结算单号继续沿用发票号，只取一次。

## 配置与调用

默认配置是 [business-numbering.yml](../../backend/src/main/resources/business-numbering.yml)，由 application.yml 导入并随应用打包。使用已有 Spring 配置机制，启动时校验并冻结配置，不创建数据库规则配置表或运行时编辑接口。系统运行与运维 → 业务编码管理（`/settings/business-numbering`）使用 `CONFIGURATION.ACCESS` 权限，查询 `/api/platform/business-numbering/rules`，显示全部规则及当前租户/机构/科室对应的当日计数快照；查询不占号、不预留。Redis 不可用仍展示规则并明确标记流水未知，用尽则下一流水和号码为空，不显示虚假的 0 或可用号。外置 YAML 可以通过 `--spring.config.additional-location=file:/path/business-numbering-override.yml` 覆盖单个规则；文件修改在重新启动发布后生效。

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

收费明细的 `docNo` 还存在 `requestCode / sourceId / id` 展示回退（BillingWorkspace），后续须先映射到原始业务号，不能为显示而重复取号。发票、支付/退款凭证和退药已分离请求键与展示号：`CD_CMD` 保存客户端原请求键，展示号由生成器取号。兼容原请求字段 `invoiceNo` / `paymentNo` / `refundNo` / `returnNo`，这些输入继续作为请求键；`InvoiceView.commandCode` 用于诊间结算确认原请求。V1_111_0 公共/Oracle 对等迁移按历史展示号回填请求键，保留旧重放行为。住院专用旧凭证接口保留原号码合同。

接入时在现有幂等检查之后取号，一次持久化，并在重试时返回已持久化的原号。号码由服务端生成，主键仍按 [雪花标识规范](../architecture/架构决策-005-雪花算法标识.md) 使用 `GlobalIds`。前端 UUID 请求号继续承担幂等功能，不能直接把展示号码当作新请求号。

切换级别之前核对实体唯一约束与查询合同。例如门诊号当前按租户唯一，机构/科室级独立序列可能产生相同显示值；这种入口接入时须采用可区分归属的前后缀/分机构规则或先调整唯一性与查找合同。不能仅缩小 Redis 计数边界就认为满足原来的租户唯一约束。已接入的 27 条门诊规则在启动时由 `OutpatientBusinessNumberingPolicy` 校验，只允许 SYSTEM / TENANT；静态前后缀不能区分同租户不同机构/科室，不能直接改为更细范围。其他未接入规则仍支持四个级别。`scope`、业务 key、Redis 前缀及时区在已有号码后变更须做发布切换评估。现有外部票号、医保号和历史打印快照不重算。

## 全域走查

扫描了所有后端模块业务号赋值及前端展示、操作、打印入口；下面列出内生/派生业务号的默认规则，共 45 项。未标注“已接入”的生成方式仍为原走查结果，文件前缀是通用工具的初始值。`settlement` 为预留独立结算号规则，当前结算沿用 `invoice`，接入时只取一次，不能无条件拆成两套。

| 配置 key | 业务 / 文件前缀 | 当前来源 / 生成入口 |
| --- | --- | --- |
| resident-record | 居民档案 / RHN | ResidentService，时间戳 + 随机字符；居民中心及临床打印 |
| outpatient-encounter | 门诊就诊 / OP | 已接入：EncounterService（挂号/直接接诊）、OutpatientReferralService（转科，目标上下文） |
| outpatient-appointment | 预约 / AP | 已接入：AppointmentApplicationService、RegistrationApplicationService（含改约） |
| outpatient-registration | 挂号 / RG | 已接入：RegistrationApplicationService |
| outpatient-triage | 预检 / TR | 已接入：OutpatientTriageService |
| outpatient-referral | 会诊转科申请 / RF | 已接入：OutpatientReferralService |
| medication-request | 药品医嘱 / MR | 已接入：MedicationRequestService |
| service-request | 检查检验及治疗医嘱 / SR | 已接入：ServiceRequestService |
| prescription | 处方 / RX | 已接入：PrescriptionService |
| inpatient-episode | 住院次 / IP | InpatientApplicationService，日期 + 雪花尾 8 位 |
| inpatient-encounter | 住院就诊 / IPE | InpatientApplicationService，同上 |
| inpatient-care-request | 住院医嘱 / IP | InpatientCareRequestStore，同上；护理/给药单打印 |
| inpatient-deposit | 预交金凭证 / IPD | InpatientWorkspace 前端日期/就诊 ID 拼接，后端校验传入 |
| invoice | 发票/计费单 / INV | 已接入：BillingApplicationService、RegistrationBillingIntentTransactionService（挂号收费预生成）；请求键与展示号分离，结算复用本号 |
| settlement | 独立结算号（预留）/ ST | SettlementApplicationService，当前复用 invoiceNo |
| payment-order | 支付订单 / PO | 已接入：PaymentOrderTransactionService |
| refund-order | 退款订单 / RO | 已接入：PaymentOrderTransactionService |
| payment | 收款凭证 / PAY | 已接入：BillingApplicationService；统一支付回执派生值只作为请求键 |
| refund | 退费凭证 / RF | 已接入：BillingApplicationService；统一退款回执派生值只作为请求键 |
| receipt | 电子票据内部号 / RC | 已接入：ReceiptTransactionService（含红冲）；外部票号保留 |
| insurance-claim | 医保内部业务 / IC | 已接入：InsuranceClaimTransactionService；外部医保号保留 |
| cashier-close | 收费员结账 / CC | 已接入：CashierCloseApplicationService |
| cashier-reopen | 结账重开 / CR | 已接入：CashierCloseApplicationService |
| reconciliation-batch | 资金对账批次 / RB | 已接入：ReconciliationTransactionService |
| treatment-task | 治疗执行 / TX | 已接入：TreatmentExecutionService，业务归属上下文 |
| diagnostic-task | 检查检验执行 / DX | 已接入：DiagnosticExecutionService，业务归属上下文 |
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
| pharmacy-dispense-task | 发药任务 / DT | 已接入：PharmacyApplicationService |
| pharmacy-review | 药房审方 / PR | 已接入：PharmacyApplicationService |
| pharmacy-return | 药房退药 / RET- | 已接入：DispenseApplicationService；请求键与展示号分离，库存流水保留原技术请求键 |
| ward-delivery | 病区配送 / WD | WardDeliveryApplicationService，当前要求传入；IPMS-WD-批次-分段为派生编号 |
| ward-medication-return | 病区退药 / WMR | WardMedicationReturnRequest，WMR + 雪花 ID；分组退药凭证由申请号派生 |
| schedule-resource | 排班资源 / SR- | 已接入：SchedulingApplicationService |
| schedule-template | 排班模板 / ST- | 已接入：SchedulingApplicationService |
| schedule | 排班 / SCH- | 已接入：SchedulingApplicationService |
| schedule-slot-pool | 号源池 / SP- | 已接入：SchedulingApplicationService |

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

`BusinessNumberingAdministrationTest` 验证配置权限、完整规则契约、重复查询不占号；`DirectVisitIntegrationTest` / `BillingSettlementTest` 追加生成号与幂等重放断言。页面 DOM 测试覆盖业务搜索、零计数、刷新、用尽/未知和权限失败；生成器测试追加只读计数、时区与容量快照。

`ConfiguredBusinessNumberGeneratorTest` 覆盖默认配置绑定、OP 示例、长短日期、前后缀、级别隔离、跨日与时钟回拨、格式变更不重置、缺失上下文、配置错误、容量和不可用错误。

`RedisBusinessNumberCounterIntegrationTest` 用 `RHN_NUMBERING_TEST_REDIS_EXECUTABLE=/absolute/path/redis-server` 指向测试二进制；测试自行启动随机端口实例，退出时只停止自身进程，不使用人工 Redis。验证两个客户端 400 次并发唯一、应用实例重建后连续、容量临界并发、12 位上限和损坏计数不重置。未设置变量时该真实 Redis 测试明确跳过；配置/生成器测试照常执行。
