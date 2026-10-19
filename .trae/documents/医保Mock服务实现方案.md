# 医保 Mock 服务实现方案

> 依据：`docs/billing/医保Mock服务接口要求.md`（下称"需求"）。
> 目标：在 `/Users/yangl/IdeaProjects/chs-mock-server` 新建独立 Spring Boot 4 + Java 21 项目，实现可重复的医保端到端联调 Mock，并向 `HttpChsNationalInsuranceClient` 与「医保接入向导」提供稳定回执。

## 1. 摘要

新建单 jar 独立服务，默认 `18090`，内存态、重启清空：

- 业务端点 `POST /hsa/api`：按 18 字段报文外壳校验 → 按 `infno` 分派 9001/1101/2201/2203A/2204/2206/2207/2208，带交易顺序状态校验；业务成功与业务拒绝统一 HTTP 200，拒绝体 `infcode=-1`。
- 管理端点 `/mock/reset`、`/mock/requests`、`/mock/config`、`/mock/health`。
- 测试人员场景由 1101 的 `mdtrt_cert_no` 选择（`TEST-310`…`TEST-SIGN-EXPIRE`），另加全局开关（强制延迟、强制应答、X-Token）。
- 交付 JUnit 端到端测试，覆盖需求 §7 全链路与 §4 全部故障场景。

## 2. 现状分析（已核实）

| 事实 | 位置 |
| --- | --- |
| 客户端真实发出的外壳 18 字段与顺序 | [HttpChsNationalInsuranceClient.java](file:///Users/yangl/IdeaProjects/rhn/backend/rhn-clinical/src/main/java/com/rhn/billing/infrastructure/insurance/chs/HttpChsNationalInsuranceClient.java#L353-L370)（`envelope(...)`） |
| 客户端实际读取的回执字段 | 同文件：`9001`→`signinoutb.sign_no`；`1101`→`baseinfo.{psn_no,certno,psn_name,gend,brdy}` + `insuinfo[]`；`2201`→`data\|result.mdtrt_id`；`2204`→`result\|data\|feedetail[]` 的 `feedetl_sn,chrgitm_lv`；`2206/2207`→`setlinfo` 金额字段（`money()` 缺字段抛异常）；`2207` 另需 `setl_time`；`2208`→`setlinfo\|data\|result.setl_id` |
| 客户端校验/行为 | 逐行 `det_item_fee_sumamt = cnt×pric` 由适配器校验；`1101` 参保选取 `psn_insu_stas=1` 否则取首条；`sign_no` 被拒后客户端会清除缓存，下次自动重新 9001 签到 |
| 配置项与默认值 | [ChsGatewayProperties.java](file:///Users/yangl/IdeaProjects/rhn/backend/rhn-clinical/src/main/java/com/rhn/billing/infrastructure/insurance/chs/ChsGatewayProperties.java)（`signInRequired` 默认 true、`medType` 默认 11、`readTimeout` 默认 20s） |
| 触发链与错误分类 | [InsuranceProbeService.java](file:///Users/yangl/IdeaProjects/rhn/backend/rhn-clinical/src/main/java/com/rhn/billing/application/InsuranceProbeService.java)（超时/HTTP/非 JSON/缺 output/平台拒绝）；`HttpChsNationalInsuranceClient.post()` 把非 2xx 视为结果未知 |
| 现有约定参考 | [收费结算模块演进设计.md](file:///Users/yangl/IdeaProjects/rhn/docs/billing/收费结算模块演进设计.md)；技术栈 Spring Boot `4.1.0` / Java 21（[backend/pom.xml](file:///Users/yangl/IdeaProjects/rhn/backend/pom.xml#L4-L17)） |

**关键落差（需求 vs 客户端真实报文）**，实现时以客户端为准并兼容需求描述：

1. 需求 §3 写 `2203A` 入参为 `data.{...}`，但客户端实际发 `input.mdtrtinfo` + `input.diseinfo`。→ Mock 两者都接受（优先 `mdtrtinfo`）。
2. 需求 §3 写 `2201` 回执为 `data.mdtrt_id`，客户端读取 `data|result`。→ Mock 返回 `output.data.mdtrt_id`。
3. 需求 §3 写 `2204` 回执为 `result[]`，客户端读取 `result|data|feedetail`。→ Mock 返回 `output.result[]`。
4. 需求 §2 要求校验全部 18 字段"存在"；客户端会把 `dev_no`/`cainfo`/`sign_no` 等发成空串。→ 校验"键存在"（null 视为缺失），并对 `infno/msgid/inf_time/opter/fixmedins_code/input` 追加非空校验。

## 3. 拟建项目结构

位置 `/Users/yangl/IdeaProjects/chs-mock-server`，坐标 `com.rhn.mock:chs-mock-server`，包 `com.rhn.mock.chs`。

```
chs-mock-server/
├── pom.xml                        # spring-boot-starter-parent 4.1.0, java 21, spring-boot-starter-web + starter-test
├── src/main/resources/application.yml
└── src/main/java/com/rhn/mock/chs/
    ├── ChsMockApplication.java
    ├── config/
    │   ├── MockProperties.java    # 绑定 mock.*（端口由 server.port 控制）
    │   └── MockConfig.java        # 运行时可改配置（比例/X-Token/延迟/强制应答/等级映射）
    ├── config/MockConfigService.java
    ├── web/
    │   ├── HsaController.java         # POST ${mock.business-path:/hsa/api}
    │   ├── MockAdminController.java   # /mock/reset /mock/requests /mock/config /mock/health
    │   ├── EnvelopeKeys.java          # 18 字段常量 + 必填分组
    │   └── MockApiExceptionHandler.java
    └── engine/
        ├── ChsMockEngine.java         # 外壳校验 + X-Token + msgid 唯一 + sign_no + 分派
        ├── MockState.java             # 内存状态（含已收报文日志）
        ├── ScenarioCatalog.java       # 证件号 → 人员/场景夹具
        ├── SettlementCalculator.java  # 2206/2207 金额分解与守恒
        ├── ExchangeLog.java           # 环形报文日志（可查询/清空）
        ├── ChsRejection.java          # infcode=-1 载体
        └── ChsRespond.java            # 回执外壳构造
```

`src/test/java/com/rhn/mock/chs/`
- `support/ChsTestClient.java`：按 `HttpChsNationalInsuranceClient.envelope()` 的真实字段名手工组包（不依赖 rhn 模块），供测试复现同一报文形状。
- `ChsEndToEndAcceptanceTest.java`：§7 全链路。
- `ChsScenarioTest.java`：§4 全部场景 + 顺序/字段/守恒拒绝。
- `ChsAdminEndpointTest.java`：管理端点。

## 4. 详细设计

### 4.1 请求处理顺序（`ChsMockEngine.handle`）

1. **X-Token**：`mock.x-token` 非空时校验请求头，不符/缺失 → HTTP 401（正文 `{"error":"..."}`），**不**记入业务报文日志。
2. 解析 JSON（非法 JSON → HTTP 400）。
3. **18 字段存在性**：任一缺失 → `infcode=-1`，`err_msg="缺少必填字段:<field>"`。
4. **非空校验**：`infno/msgid/inf_time/opter/fixmedins_code` 与 `input`（对象）为空 → `-1`。
5. **`inf_time`**：`yyyy-MM-dd HH:mm:ss` 解析失败 → `-1`。
6. **`msgid` 唯一**：已出现 → `-1`，`err_msg` 含"重复"。
7. **签到校验**：`infno != 9001` 且 `mock.sign-in-required=true` 时，`sign_no` 必须等于 `MockState.signNos[opter]`，否则 `-1`，`err_msg` 含"签到"。
8. **全局开关**：`forceDelayMs>0` → `Thread.sleep`；`forceInfcode != null` → 直接按开关应答（仍记日志）。
9. 按 `infno` 分派交易处理器。
10. 无论成败，都向 `ExchangeLog` 追加一条 `{time, infno, msgid, httpStatus, request, response}`。

回执外壳：成功 `{"infcode":0,"inf_refmsgid":<msgid>,"refmsg_time":..,"respond_time":..,"err_msg":"","output":{..}}`；拒绝 `{"infcode":-1,"inf_refmsgid":<msgid>,"refmsg_time":..,"respond_time":..,"err_msg":".."}`（HTTP 仍 200）。

### 4.2 交易处理器与状态

`MockState` 字段：`seenMsgIds`、`signNos(Map<opter, signNo>)`、`credentials(Map<psn_no, {certType,certNo,insuplcByInsutype}>)`、`registrations(Map<mdtrt_id,{psn_no,certType,certNo}>)`、`diagnosisUploaded(Set<mdtrt_id>)`、`feeUploaded(Set<mdtrt_id>)`、`preSettlements(Map<mdtrt_id,setlinfo+setl_id>)`、`settlements(Map<mdtrt_id,setl_id>)`、`settledRecords(Map<setl_id,{mdtrt_id,reversed}>)`、`verifyFailureTriggered(Set<psn_no>)`。

| infno | 校验 | output |
| --- | --- | --- |
| **9001** 签到 | `input.signIn.opter_no` 存在 | `signinoutb.{sign_no,sign_time}`；同一 opter 重复签到签发**新** `sign_no` 并覆盖旧值（旧值即失效） |
| **1101** 人员信息 | `input.data.mdtrt_cert_no` 存在；按证件号匹配场景 | `baseinfo.{psn_no,certno,psn_name,gend,brdy}` + `insuinfo[]`（`insutype,psn_insu_stas,balc,psn_type,insuplc_admdvs`）；成功时写 `credentials[psn_no]={certType,certNo,regions}` |
| **2201** 就诊登记 | `data.psn_no` 已在 `credentials`；`data.mdtrt_cert_type/mdtrt_cert_no` 与 1101 记录**一致** | `data.mdtrt_id`；写 `registrations` |
| **2203A** 诊断上传 | 先有 2201；主诊断非空（`mdtrtinfo.main_cond_dscr` 与 `dise_codg`，兼容 `data.*`） | `{}`；写 `diagnosisUploaded` |
| **2204** 费用明细 | 先有 2203A；`feedetail[]` 非空；逐行 `det_item_fee_sumamt == cnt×pric` | `result[]`：逐行 `feedetl_sn,chrgitm_lv`；写 `feeUploaded` |
| **2206** 预结算 | 先有 2204；`data.mdtrt_id/psn_no/insutype/medfee_sumamt` 与登记一致 | `setlinfo`（全集见 4.4，无 `setl_time`）；存 `preSettlements` |
| **2207** 结算 | 先有 2206（同 `mdtrt_id`）；同 `mdtrt_id` **未**结算过，否则 `-1` 含"重复结算" | `setlinfo`（含 `setl_time`）；写 `settlements`/`settledRecords` |
| **2208** 撤销 | `setl_id` 已结算；未撤销，否则 `-1` 含"已撤销" | `setlinfo.setl_id`（撤销流水）；标记 `reversed` |

### 4.3 场景夹具（`ScenarioCatalog`，键为 1101 的 `mdtrt_cert_no`）

| 证件号 | 行为 |
| --- | --- |
| `TEST-310` | 310 职工，正常，`balc=1850.00`，`insuplc_admdvs=360100` |
| `TEST-390` | 390 居民，正常，无 `balc`/无个账 |
| `TEST-MULTI` | `insuinfo` 两条：`{390, stas=3}` + `{310, stas=1, balc=1850.00}`（客户端取正常条） |
| `TEST-SUSPENDED` | 310，`psn_insu_stas=2` |
| `TEST-NOINSU` | 1101 直接 `infcode=-1`，`err_msg="无参保信息"` |
| `TEST-REJECT-2206` | 1101 正常(310)，2206 返回 `-1`"该患者存在未结算记录" |
| `TEST-IMBALANCE` | 2206/2207 的 `setlinfo` 金额故意不守恒（`medfee_sumamt` 与右侧合计不等） |
| `TEST-MISSING-AMT` | 2206 的 `setlinfo` 缺 `acct_pay` |
| `TEST-SLOW` | 2206 `sleep(mock.slow-delay-ms)`（默认 31000，>30s，验证超时） |
| `TEST-HTTP500` | 2207 直接 HTTP 500（正文任意） |
| `TEST-BADJSON` | 2207 返回 `text/plain` 非 JSON 文本 |
| `TEST-SIGN-EXPIRE` | 1101 正常；**首个非 9001/1101 业务交易成功后**清空 `signNos[opter]`，下一次交易返回 `-1` 含"签到" |
| 其他/未匹配 | 默认按 `TEST-310` 的 310 正常人员（保证向导可自由输入测试） |

未知证件号统一按 `TEST-310` 处理，避免联调时因证件号不匹配而无法走通。

### 4.4 `setlinfo` 生成与守恒（`SettlementCalculator`）

入参：`medfee_sumamt`、逐行 `{amount,cnt,pric,chrgitm_lv}`、`acct_used_flag`、`insutype`、个账余额。

等级判定（2204 时确定，`chrgitm_lv`）：`itemLevelPrefixes` 前缀映射，默认 `X→01(甲) / Z→02(乙) / T→03(丙)`，无匹配→`03`；可经 `/mock/config` 覆盖。

金额（均 `HALF_UP` 两位小数字符串）：
- 甲类行：`fund = round(amount × ip-pool-ratio)`（默认 0.80）
- 乙类行：`preself = round(amount × preself-ratio)`（默认 0.15）；`fund = round((amount − preself) × ip-pool-ratio-b)`（默认 0.70）
- 丙类行：`fund = 0`
- `fulamt_ownpay_amt = Σ丙类 amount`；`preselfpay_amt = Σ乙类 preself`；`inscp_scp_amt = medfee_sumamt − fulamt_ownpay_amt`
- `fund_pay_sumamt = Σ各行 fund`；`hifp_pay = fund_pay_sumamt`（统筹）；`hifob_pay = 0.00`
- 个人负担 `self = medfee_sumamt − fund_pay_sumamt`；
  `acct_used_flag=1` 且 `insutype=310` 且有个账余额 → `acct_pay = min(balc, self)`，`psn_cash_pay = self − acct_pay`；否则 `acct_pay=0.00`，`psn_cash_pay=self`（390 居民无个账）
- `acct_mulaid_pay` 不返回（按缺省 0 处理）

据此恒满足：`medfee_sumamt = fund_pay_sumamt + acct_pay + psn_cash_pay`，且 `fund_pay_sumamt ≥ hifp_pay + hifob_pay`。
`setl_id` 前缀区分：2206 `PRE`+序号、2207 `SETL`+序号、2208 `REV`+序号、`mdtrt_id`=`MDT`+序号、`sign_no`=`SIGN`+序号。2207 的 `setl_time` 为当前 `yyyy-MM-dd HH:mm:ss`。

### 4.5 管理端点

- `POST /mock/reset`：清空 `MockState` 与 `ExchangeLog`（保留 `MockConfig`）。
- `GET /mock/requests?infno=&limit=`：按时间倒序返回 `[{time,infno,msgid,httpStatus,request,response}]`，`limit` 默认 100。
- `GET /mock/config` / `PUT /mock/config`：读写 `{ipPoolRatio,preselfRatio,ipPoolRatioB,xToken,signInRequired,forceDelayMs,slowDelayMs,forceInfcode,forceErrMsg,itemLevelPrefixes}`；PUT 支持部分字段更新。
- `GET /mock/health`：`{"status":"UP","transactions":<n>}`。

安全：`server.address` 默认 `127.0.0.1`（联调同机），管理端点不校验 `xToken`，仅靠本机绑定保护。

### 4.6 `application.yml`（默认值）

```yaml
server:
  port: 18090
  address: 127.0.0.1
mock:
  business-path: /hsa/api
  x-token: mock-token          # 非空即校验；置空关闭
  sign-in-required: true
  ip-pool-ratio: 0.80
  preself-ratio: 0.15
  ip-pool-ratio-b: 0.70
  slow-delay-ms: 31000
  requests-buffer-size: 1000
```

## 5. 假设与决策

1. **以客户端真实报文为准**：2203A 收 `mdtrtinfo`（兼容 `data`）、2201 回 `data.mdtrt_id`、2204 回 `result[]`（见 §2 落差 1–3）。
2. **"字段存在"判定**：键缺失或值为 `null` 视为缺失；空串视为存在（客户端会发空串），仅对 6 个语义字段追加非空校验。
3. **X-Token 默认开启**为 `mock-token`，与需求 §6 示例一致；置空即关闭，便于手工 curl。
4. **服务绑定 127.0.0.1**，管理端点不额外加令牌（需求允许"仅监听本机"）。
5. **`chrgitm_lv` 由 med_list_codg 前缀映射决定**，默认 `X/Z/T→01/02/03`，可配置；需求未规定映射，此为可测试的确定性约定。
6. **新增 `sign-in-required` 开关**：客户端 `sign-in-required=false` 时全报文 `sign_no` 为空，若不开关会全量拒绝；默认 true 与需求一致。
7. **未匹配证件号按 310 正常人员处理**，保证向导任意输入可走通。
8. 不改动 rhn 仓库任何源码/配置；需求 §6 的 yaml 仅作联调参考（非本次交付物）。
9. `TEST-SLOW` 真实延迟默认 31s；自动化测试通过 `PUT /mock/config` 调小该值来断言延迟机制，不实际等待 30s。

## 6. 验证

1. 自动化（主证据）：`mvn -f /Users/yangl/IdeaProjects/chs-mock-server/pom.xml -q verify`
   - §7 全链路 `TEST-310`：9001→1101→2201→2203A→2204→2206→2207→2208 全部成功，逐笔断言回执字段，`/mock/requests` 中 8 条报文字段齐全且守恒成立。
   - §4 每个场景逐一断言对应行为（含 `TEST-SLOW` 延迟、`TEST-HTTP500` 500、`TEST-BADJSON` 非 JSON、`TEST-SIGN-EXPIRE` 二次拒绝）。
   - 顺序错误（先 2204 无 2203A、无 2206 直接 2207、重复结算/重复撤销）、18 字段任一缺失、`det_item_fee_sumamt≠cnt×pric`、不守恒 → 均 `infcode=-1`，不得成功。
   - `X-Token` 不符 → 401。
   - 管理端点 reset/config/requests 行为。
2. 冒烟：`java -jar target/chs-mock-server-*.jar` 后 `curl -s localhost:18090/mock/health`。
3. 人工联调（可选，需用户确认后再做）：将 rhn 的 `rhn.billing.insurance.chs.gateway.base-url` 指向 `http://localhost:18090/hsa/api`，`enabled=true`，在「医保接入向导」跑 SIGN_IN→PERSON→PRE_SETTLE→SETTLE 四步。此步会改动运行配置，不在本次自动执行范围。

## 7. 非目标

- 不实现真实医保目录/政策校验（比例仅演示）。
- 不持久化（重启清空，符合需求 §1）。
- 不改动 rhn 仓库代码、CI 或 `verify-scope.sh`。
- 不交付 Docker 镜像（需求"单 jar 或容器"任选其一，本次取单 jar）。
