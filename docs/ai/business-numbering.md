# 业务编码配置与接入清单

系统运行与运维 → 业务编码管理（`/settings/business-numbering`）查询 `/api/platform/business-numbering/rules`，需要 `CONFIGURATION.ACCESS` 权限。页面显示生效规则、计数范围、每日或持续流水、已用及下一可用流水。查询不占号、不预留，下一号码只是查询时快照；Redis 不可用时显示未知，用尽时下一号码为空。

## 默认推荐与归属

业务编码只分配给业务人员使用的单据、申请和稳定业务对象。默认 37 类规则全部接入统一 `BusinessNumberGenerator`；历史号码保留。机构级单据不拼机构代码，不同机构允许号码相同，每个机构独立自增。数据库唯一性采用租户 + 所属机构 + 业务号，按号码查找必须同时限定机构。科室用于权限和工作上下文，默认不拆科室流水，避免跨科室协作时出现歧义。

居民档案跨机构共享，采用租户级无日期 7 位持续流水，容量 9,999,999。排班资源与模板为机构内稳定对象，采用无日期 4 位持续流水，容量各 9,999。常规机构单据为前缀 + 短日期 `yyMMdd` + 5 位流水，每日可取 99,999 个；适合单机构万级日门诊量。低频管理单据采用 4 位，每日 9,999 个。跨机构支付/退款订单保留租户级 6 位日流水，转科申请保留租户级 5 位，保证回调、关联与路由合同。

住院检验检查申请复用 `service-request`（SR）规则，按执行机构取号；普通住院医嘱明细不独立取号。药品医嘱明细、库存流水、执行任务、发药任务、审方记录和号源池不再独立取业务号。保留内部 ID、请求幂等键及关联处方/申请/原始单据。旧字段兼容历史数据，新增可为空；药房与治疗显示关联处方或申请号，打印条码以内部任务 ID 标识任务。发药操作的请求标识继续按租户唯一，不能把它当机构级展示单号。

## 文件配置与调用

权威配置为 [business-numbering.yml](../../backend/src/main/resources/business-numbering.yml)，启动校验并冻结，管理页只读。外置 YAML 可通过 `--spring.config.additional-location=file:/path/business-numbering-override.yml` 覆盖单条规则，发布重启后生效。

```yaml
rhn:
  business-numbering:
    rules:
      outpatient-encounter:
        prefix: OP
        date-format: yyMMdd
        sequence-width: 5
        scope: ORGANIZATION
      resident-record:
        prefix: RHN
        date-format: ""
        sequence-width: 7
        scope: TENANT
```

日期格式允许空字符串（也接受 `none`）、`yyMMdd` 或 `yyyyMMdd`，兼容小写输入。省略字段仍沿用通用默认：空前后缀、短日期、5 位、TENANT；本文件显式推荐每个业务的归属。序列宽度 1–12，不截断、不循环。含日期规则限业务日 2000–2099，无日期规则持续递增。前后缀最多各 16 个 ASCII 编码字符。

```java
String number = numbers.next("outpatient-encounter");
// 后台任务、跨机构业务先验证归属，再显式传单据所属机构。
String targetNumber = numbers.next("service-request",
        new BusinessNumberContext(tenantId, performerOrganizationId, performerDepartmentId));
String example = numbers.preview("resident-record", LocalDate.of(2026, 10, 13), 1);
```

Redis key 为 `rhn:business-number:<业务类型>:<范围>:<yyyyMMdd或continuous>`。日期日流水包含完整业务日；无日期使用 `continuous`，跨日不重置。计数范围通用工具支持 SYSTEM / TENANT / ORGANIZATION / DEPARTMENT；当前业务唯一约束支持前三种，禁止把已接入单据配置为科室级，居民档案、支付/退款订单、转科申请只能系统或租户级。申请单以执行机构取号，处方以开立机构取号，库存以持有机构取号。

## 迁移、并发与幂等

V1_112_0 公共/Oracle 对等迁移将机构单据唯一约束改为机构范围，为票据、医保业务、退药和排班模板回填归属机构，内部号码字段改为可空并撤销号码唯一约束，Oracle 申请单采用条件唯一索引以跳过无号码明细。配送请求键新增 `CD_CMD` 并按历史配送号回填。历史展示号、外部医保/财政/支付/LIS/RIS 编号均不重算。

租户日流水切到机构日流水时，读取旧租户计数作为当日下限，Lua 原子提升机构计数并递增，避免与切换前同日号码重复。只读查询显示此有效下限。修改前缀/日期显示长度/宽度不重置对应计数；切换到无日期会采用独立持续 key，现有默认稳定对象同时采用新的业务前缀。范围、业务 key、Redis 前缀、时区或日期周期改变必须评估历史号码冲突，不能随意删除计数。

Redis 单 key Lua 原子执行容量检查与递增，不设过期；生产需可靠持久化、备份及 noeviction。Redis 与数据库事务不能原子提交，失败可跳号，禁止退号、递减或复用。不可用返回 BUSINESS_NUMBER_UNAVAILABLE / 503，用尽返回 BUSINESS_NUMBER_EXHAUSTED / 409，无随机/内存降级。

取号在既有幂等检查之后，持久化一次，重试返回原号。收费发票、收退款、预交金、退药和配送分离技术请求键与展示号；输入字段兼容原命名，输入值作为请求键。结算沿用发票号，不另取号。内部主键继续使用 GlobalIds，不用业务号定位库存和执行记录。

## 生效规则

| 配置 key | 业务 / 前缀 | 范围 | 日期与周期 | 流水位数 |
| --- | --- | --- | --- | --- |
| resident-record | 居民档案 / RHN | 租户 | 无日期、持续 | 7 |
| outpatient-encounter | 门诊就诊 / OP | 机构 | yyMMdd、每日 | 5 |
| outpatient-appointment | 预约 / AP | 机构 | yyMMdd、每日 | 5 |
| outpatient-registration | 挂号 / RG | 机构 | yyMMdd、每日 | 5 |
| outpatient-triage | 预检 / TR | 机构 | yyMMdd、每日 | 5 |
| service-request | 检查检验及治疗医嘱 / SR | 机构 | yyMMdd、每日 | 5 |
| diagnostic-specimen | 实际检验标本 / SP | 机构 | yyMMdd、每日 | 6 |
| prescription | 处方 / RX | 机构 | yyMMdd、每日 | 5 |
| inpatient-encounter | 住院就诊 / IPE | 机构 | yyMMdd、每日 | 5 |
| inpatient-episode | 住院次 / IP | 机构 | yyMMdd、每日 | 5 |
| inpatient-deposit | 预交金凭证 / IPD | 机构 | yyMMdd、每日 | 5 |
| invoice | 发票/计费单 / INV | 机构 | yyMMdd、每日 | 5 |
| payment-order | 支付订单 / PO | 租户 | yyMMdd、每日 | 6 |
| refund-order | 退款订单 / RO | 租户 | yyMMdd、每日 | 6 |
| payment | 收款凭证 / PAY | 机构 | yyMMdd、每日 | 5 |
| refund | 退费凭证 / RF | 机构 | yyMMdd、每日 | 5 |
| receipt | 电子票据内部号 / RC | 机构 | yyMMdd、每日 | 5 |
| insurance-claim | 医保内部业务 / IC | 机构 | yyMMdd、每日 | 5 |
| cashier-close | 收费员结账 / CC | 机构 | yyMMdd、每日 | 4 |
| cashier-reopen | 结账重开 / CR | 机构 | yyMMdd、每日 | 4 |
| reconciliation-batch | 资金对账批次 / RB | 机构 | yyMMdd、每日 | 4 |
| stock-purchase-order | 采购 / PUR | 机构 | yyMMdd、每日 | 4 |
| stock-goods-receipt | 到货 / GR | 机构 | yyMMdd、每日 | 4 |
| stock-transfer | 调拨 / STF | 机构 | yyMMdd、每日 | 4 |
| stock-requisition | 请领 / REQ | 机构 | yyMMdd、每日 | 4 |
| stock-count | 盘点 / CT | 机构 | yyMMdd、每日 | 4 |
| stock-price-adjustment | 调价 / PA | 机构 | yyMMdd、每日 | 4 |
| stock-period-close | 库存期结 / PC | 机构 | yyMMdd、每日 | 4 |
| stock-reconciliation | 库存对账 / REC | 机构 | yyMMdd、每日 | 4 |
| medication-supply-batch | 住院药品供给批次 / MS | 机构 | yyMMdd、每日 | 5 |
| pharmacy-return | 药房退药 / RET | 机构 | yyMMdd、每日 | 5 |
| ward-delivery | 病区配送 / WD | 机构 | yyMMdd、每日 | 5 |
| ward-medication-return | 病区退药 / WMR | 机构 | yyMMdd、每日 | 5 |
| outpatient-referral | 会诊转科申请 / REF | 租户 | yyMMdd、每日 | 5 |
| schedule-resource | 排班资源 / RES | 机构 | 无日期、持续 | 4 |
| schedule-template | 排班模板 / TPL | 机构 | 无日期、持续 | 4 |
| schedule | 排班 / SCH | 机构 | yyMMdd、每日 | 5 |

外部识别号、药品追溯码、厂家批号、标准主数据代码均沿用权威来源。排队短号仍使用队列 + 营业日的数据库锁序列，与叫号顺序联动，不并入本工具。
