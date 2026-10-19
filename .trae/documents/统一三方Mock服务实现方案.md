# 统一三方 Mock 服务实现方案

> 基线：现有 `/Users/yangl/IdeaProjects/chs-mock-server`（医保 CHS 单协议 Mock，31 测试全绿）
> 目标：同一进程内提供 **医保 CHS + 支付宝 + 微信支付** 三种协议 Mock，让 rhn 用**真实 SDK** 指向本地
> 后续：CA 厂商 Mock 已由独立任务并入同一进程（第 4 个协议插件，见 §1 与 §11）

## 1. Context

当前三方联调能力是碎片化的：医保有独立 Mock 服务，支付只有进程内的 `AggregatedPaymentChannelAdapter` 模拟器（不发网络请求），票据/CA 只有进程内 `@ConditionalOnProperty` 假实现。结果是**支付渠道的 SDK 接入层（加签、报文格式、响应验签）从未被端到端验证过**——现有 `DirectPaymentChannelAdapterTest` 全部用 Mockito mock 掉 SDK 客户端。

本方案把已有的医保 Mock 服务升级为多协议 Mock 服务，让真实 SDK 打到本地 Mock，从而验证"SDK ↔ 三方协议"这一段。

**已确认决策**：
1. 项目重命名为 `thirdparty-mock-server`，医保成为第一个协议插件；对外 HTTP 契约 `/hsa/api`、`/mock/*` 保持不变。
2. 支付走**协议级仿真**（Mock 实现支付宝 `gateway.do` RSA2 与微信 v2 XML MD5）。
3. 允许改 rhn，但必须走 test-only 开关，**默认关闭、生产行为零变化**。
4. 单端口 `18090` 按路径分区。

**明确不做**：财政票据 —— `StandardFiscalReceiptClient` 恒返回 `FISCAL_GATEWAY_NOT_IMPLEMENTED`，线上协议与加签方式均未定义，Mock 无对齐依据。应单独立项先定义契约。

**CA 由非目标改为已实现**（见 §11）：原判断是"BJCA 厂商适配器不存在、线上协议与加签方式未定义"。现在 rhn 侧 CA 基座已合入 main（`com.rhn.platform.cryptography` 的 `CaVendorAdapter` 及 7 个端口 + [通用CA集成功能设计.md](file:///Users/yangl/IdeaProjects/rhn/docs/architecture/通用CA集成功能设计.md)），真实厂商报文虽仍未定义，但该工作流按 SPI 语义 **自拟**了一套 HTTP/JSON 协议（SM2/SM3，可真实验签），"契约未定义"不再成立。因此 CA 作为第 4 个协议插件并入同一进程：`mock.ca.*`、业务端点 `/ca/v1/<组>/<操作>`、管理端点 `/mock/ca/**`，协议契约见 `thirdparty-mock-server/docs/ca-mock-protocol.md`。**遗留**：RHN 侧调用它的 `mock-ca` `CaVendorAdapter` 尚未实现（该文档 §9 有 11 项清单）。

## 2. 目标架构

### 2.1 端口与路径分区（单进程 18090）

| 协议 | 路径 | 消费方 |
|---|---|---|
| CHS | `POST /hsa/api`（`mock.chs.business-path`，保持可配） | `HttpChsNationalInsuranceClient` |
| 支付宝 | `POST /alipay/gateway.do` | `DefaultAlipayClient` 的 `serverUrl` |
| 微信 v2 | `POST /wxpay/pay/micropay`、`/wxpay/pay/orderquery`、`/wxpay/secapi/pay/refundv2`、`/wxpay/pay/refundquery` | `WxPayConfig.apiHostUrl` |
| CA 厂商 | `POST /ca/v1/<组>/<操作>`（`mock.ca.base-path`） | 待新增的 `mock-ca` `CaVendorAdapter`（RHN 侧尚未实现） |
| 管理 | `GET/POST/DELETE /mock/*`（CA 另有 `/mock/ca/**`） | 运维 / 测试 |

微信子路径说明：WxJava `getPayBaseUrl()` 返回 `config.getApiHostUrl()`，随后拼 `/pay/micropay` 等；`refundV2()` 拼 `/secapi/pay/refundv2`（**不是** `/secapi/pay/refund`）。

### 2.2 包结构

```
com.rhn.mock
├── MockApplication                 （改名自 ChsMockApplication；扫描 com.rhn.mock + 注册各协议 @ConfigurationProperties，现为 5 个：core/chs/alipay/wxpay/ca）
├── core
│   ├── JsonNodes                   （移自 engine，不变）
│   ├── ExchangeLog                 （移自 engine；Entry 泛化为 protocol/op/refId）
│   ├── MockHttpResponse            （改名自 ChsRespond）
│   ├── MockRawResponse             （改名自 ChsRawResponse）
│   ├── MockRejection               （改名自 ChsRejection）
│   ├── spi/MockProtocol            （新增，见 2.3）
│   ├── config/MockCoreProperties   （新增：mock.requests-buffer-size）
│   └── web/{MockAdminController, MockApiExceptionHandler}  （移入 + 多协议化）
├── protocol.chs
│   ├── ChsProtocol                 （新增：MockProtocol 实现，聚合 reset/config）
│   ├── ChsMockEngine               （移入；switch 分派保持原样，不做注册表化）
│   ├── ChsMockState / ScenarioCatalog / SettlementCalculator
│   ├── config/{ChsMockProperties, ChsMockConfig, ChsMockConfigService}
│   └── web/{EnvelopeKeys, HsaController}
├── protocol.alipay
│   ├── AlipayProtocol / AlipayGatewayService / AlipaySigner / AlipayMockState
│   ├── config/AlipayMockProperties
│   └── web/AlipayGatewayController
├── protocol.wxpay
│   ├── WxpayProtocol / WxpayGatewayService / WxpaySigner / WxpayXml / WxpayMockState
│   ├── config/WxpayMockProperties
│   └── web/WxpayController
└── protocol.ca                      （CA 独立任务并入，见 §1）
    ├── CaProtocol / CaMockEngine / CaVendorService / CaAuthority / CaCrypto
    ├── CaMockState / CaScenarioCatalog / CaFailure
    ├── config/{CaMockProperties, CaMockConfig, CaMockConfigService}
    └── web/{CaController, CaAdminController}
```

**刻意不做的事**：不引入 `ChsTransaction`/`AlipayMethodHandler` 之类的细粒度 SPI 注册表。CHS 的 `switch(infno)`（`ChsMockEngine` L93-105）保持原样——本次的抽象目标是**协议级隔离**，不是内部 DI 纯度；为 4-8 个分支引入注册表属于过度设计。

### 2.3 唯一的新增 SPI

```java
public interface MockProtocol {        // 每协议一个 @Component
    String id();                       // "chs" | "alipay" | "wxpay" | "ca"
    void reset();                      // 清本协议内存态 + 配置复位
    ObjectNode configView();
    ObjectNode applyConfig(JsonNode patch);
}
```

路由不经过 SPI：各协议各自持有 `@RestController`，用 Spring 原生路径映射（`HsaController` 的 `${mock.chs.business-path:/hsa/api}`、`AlipayGatewayController` 的 `/alipay/gateway.do`、`WxpayController` 类级 `/wxpay` + 4 个显式 `@PostMapping`、CA 的 `CaController` 用 `${mock.ca.base-path:/ca}/v1/**` 单一入口后按操作名内部分派）。理由：各协议路径形态差异大（固定单路径 / 固定单路径 / 固定基址+4 子路径 / 基址+分组操作），原生映射类型安全、零 HandlerMapping 风险；单一 Router + `/**` 捕获需手写路径解析，只在动态插件加载场景才有价值。

`MockProtocol` 只服务管理端点（枚举协议、reset、配置视图）。

## 3. 管理端点多协议化（保持向后兼容）

`ExchangeLog.Entry` 改为：

```java
record Entry(String time, String protocol, String op, String refId,
             int httpStatus, String request, String response) {}
```

`op`：CHS=infno、alipay=method、wxpay=api 路径；`refId`：msgid / out_trade_no / out_trade_no。`query(protocol, op, limit)`，`op` 为空不筛选。

`MockAdminController` 改造：

| 端点 | 改造 |
|---|---|
| `POST /mock/reset` | 注入 `List<MockProtocol>` 逐个 `reset()`；响应新增 `"reset":["chs","alipay","wxpay"]`（CA 并入后为 `[…,"ca"]`） |
| `GET /mock/requests` | 新增 `protocol`、`op`；`infno` 保留为 CHS 的 op 别名（`infno` 非空 ⇒ `protocol=chs,op=infno`） |
| `GET/PUT /mock/config` | 无参 = CHS 视图（**逐字段等价旧输出**）；`?protocol=alipay\|wxpay\|ca` 返回该插件；`?protocol=all` 返回 `{"chs":{…},"alipay":{…},"wxpay":{…}}`（CA 并入后含 `"ca"`） |
| `GET /mock/health` | 保留 `status`/`transactions`，新增 `"protocols":[…]` |

兼容性判据：`GET /mock/config`（无参）与 `GET /mock/requests?infno=2206` 的输出必须与改造前一致（现有 `ChsAdminEndpointTest` 不改断言即可通过）。

## 4. 配置命名空间

`MockProperties` 拆为 4 个 record：`MockCoreProperties("mock")`、`ChsMockProperties("mock.chs")`、`AlipayMockProperties("mock.alipay")`、`WxpayMockProperties("mock.wxpay")`（CA 并入后再加 `CaMockProperties("mock.ca")`，同属该命名空间约定）。CHS 的运行时可变字段（`ipPoolRatio/preselfRatio/ipPoolRatioB/itemLevelPrefixes/xToken/signInRequired/force*/slowDelayMs`）下沉到 `ChsMockConfig`，`MockConfigService` 退化为按 `MockProtocol` 聚合的门面。

```yaml
server: { port: 18090, address: 127.0.0.1 }
mock:
  requests-buffer-size: 1000
  chs:
    business-path: /hsa/api
    x-token: mock-token
    sign-in-required: true
    ip-pool-ratio: 0.80
    preself-ratio: 0.15
    ip-pool-ratio-b: 0.70
    slow-delay-ms: 31000
  alipay:
    gateway-path: /alipay/gateway.do
    app-id: mock-alipay-app
    seller-id: "2088mock"
    sign-type: RSA2
    charset: UTF-8
    require-request-sign: true
    response-sign-private-key: classpath:mock/alipay/alipay-private-key.pem
    request-verify-public-key: classpath:mock/alipay/app-public-key.pem
  wxpay:
    base-path: /wxpay
    appid: wxmockappid00001
    mch-id: "1900000109"
    api-key: "0123456789abcdef0123456789abcdef"
    default-bank-type: CFB_DEBIT
  # CA 并入后新增（完整字段与运行时开关见 thirdparty-mock-server/docs/ca-mock-protocol.md）
  ca:
    base-path: /ca
    vendor-code: mock-ca
    client-id: mock-ca-client
    client-secret: mock-ca-secret
    root-cert: classpath:mock/ca/ca-root-cert.pem
    root-key: classpath:mock/ca/ca-root-key.pem
    tsa-cert: classpath:mock/ca/ca-tsa-cert.pem
    tsa-key: classpath:mock/ca/ca-tsa-key.pem
    signer-validity-days: 365
    login-challenge-ttl-seconds: 120
    slow-delay-ms: 5000
    timeout-delay-ms: 31000
    auto-confirm-orders: false
    auto-confirm-login-signer: ""
```

## 5. 支付宝协议仿真要点

- 入参：`DefaultAlipayClient` POST `application/x-www-form-urlencoded`，字段 `app_id/method/charset/sign_type/sign/timestamp/version/biz_content`（`biz_content` 是 JSON 字符串）。Controller 用 `@RequestParam Map<String,String>` 兼容 form 与 query。
- method 白名单（与适配器 4 个调用一一对应）：`alipay.trade.pay`、`alipay.trade.query`、`alipay.trade.refund`、`alipay.trade.fastpay.refund.query`；其余返回 `code=40004, sub_code=isv.invalid-method`。
- 响应外壳：`{"<method 点换下划线>_response":{…},"sign":"<base64 RSA2>"}`，如 `alipay_trade_pay_response`。
- **签名必须逐字节一致**：`AbstractAlipayClient.checkResponseSign` 校验的是"发出去的 `*_response` 原始 JSON 文本"，不能用 `ObjectNode.toString()` 二次序列化。实现顺序必须是：先拼内层 JSON 字符串 → 用私钥 `SHA256withRSA` 签名 → 手工拼外壳字符串。这是本方案最容易踩的坑。
- 请求验签：按 key 升序拼 `k=v&…`，排除 `sign`/`sign_type`/空值，用 `request-verify-public-key` 校验；`require-request-sign=false` 可临时关闭排障。
- 关键响应字段（适配器 `AlipayPaymentChannelAdapter` 会读）：
  - pay：`code=10000`、`out_trade_no`、`trade_no`、`total_amount`、`trans_currency`（非空时必须为 `CNY`）
  - query：`code=10000`、`trade_status`（`TRADE_SUCCESS`/`TRADE_FINISHED`/`TRADE_CLOSED`）
  - refund：`code=10000`、`trade_no`
  - fastpay.refund.query：`out_request_no`、`trade_no`、`refund_status=REFUND_SUCCESS`、`refund_amount`
- 场景钩子：`auth_code` 前缀 `SIM_PAYING_`→`code=10003`（适配器视为 pending）、`SIM_FAIL_`→`code=40004`；`out_trade_no` 后缀 `-CLOSED`→`trade_status=TRADE_CLOSED`。

## 6. 微信 v2 协议仿真要点

- 4 个路径见 2.1；请求/响应均为 XML。
- **必须带签名**：`WechatPaymentChannelAdapter.identity()`（L83-90）要求 `sign` 非空且 `return_code`/`result_code` 均为 `SUCCESS`、`appid`/`mch_id` 匹配、`sub_mch_id` 为空；WxJava 在 sign 存在时会验签。MD5 规则：升序拼 `k=v&…`（排除 `sign` 与空值），追加 `&key=<apiKey>`，MD5 后大写。
- micropay 响应必填：`return_code`/`result_code`/`appid`/`mch_id`/`nonce_str`/`sign`/`openid`/`trade_type`/`bank_type`/`fee_type=CNY`/`total_fee`/`cash_fee`/`transaction_id`/`out_trade_no`/`time_end`。
- orderquery：加 `trade_state=SUCCESS`（或 `CLOSED`/`REVOKED`/`PAYERROR` 触发适配器不同分支）、`trade_state_desc`。
- refundv2：加 `out_refund_no`/`refund_id`/`refund_fee`/`total_fee`/`refund_status=SUCCESS`。
- refundquery：需 `<refund_records><item>…</item></refund_records>`，`item` 含 `out_refund_no`/`refund_id`/`refund_status`/`refund_fee`（适配器按 `out_refund_no` 匹配且要求恰好 1 条）。
- 业务失败（如坏签名、未知单号）：置 `return_code=FAIL` + `return_msg`，**仍需签名**。
- **证书结论**：`refundV2` 走 `isUseCert=true`，`WxPayServiceApacheHttpImpl` 会调 `initSslHttpClient()` ⇒ `WxPayConfig.initSSLContext()` 需要可用的 PKCS12。但 Apache 客户端只对 `https://` URI 启用 TLS，因此 `apiHostUrl=http://127.0.0.1:18090/wxpay` 可用，只要提供一份 p12。p12 生成：`keytool -genkeypair -alias merchant -keyalg RSA -keysize 2048 -storetype PKCS12 -dname CN=<mchId> -storepass <mchId> -keypass <mchId>`（密码即 mchId，与 `PaymentCredentialValidation.p12(encoded, merchantId)` 及 WxJava 的约定一致）。Mock 不校验 mTLS。

## 7. rhn 侧 test-only 改动

**新增** `backend/rhn-clinical/src/main/java/com/rhn/billing/infrastructure/payment/PaymentMockProperties.java`：

```java
@ConfigurationProperties(prefix = "rhn.billing.payment.mock", ignoreUnknownFields = false)
public record PaymentMockProperties(@DefaultValue("false") boolean enabled,
                                    String alipayGatewayUrl, String wechatApiHostUrl) {}
```

| 文件 | 改动 | 生产默认影响 |
|---|---|---|
| `AlipayPaymentClients.java` | 构造新增 `PaymentMockProperties`；L87 与 L116 的硬编码 `Set.of(...)` 改为 `allowedGateways()`（默认仍仅官方两项，`mock.enabled=true` 时追加 `mock.alipayGatewayUrl`） | 零变化 |
| `WechatPaymentClients.java` | 构造新增 `PaymentMockProperties`；`buildWechat`(L83-92) 与 `buildManaged`(L73-81) 中，`mock.enabled && wechatApiHostUrl` 非空时 `config.setApiHostUrl(...)` | 零变化 |
| `AlipayPaymentConfiguration.java` / `WechatPaymentConfiguration.java` | `@EnableConfigurationProperties` 追加 `PaymentMockProperties`，Bean 方法传入 | 零变化 |
| `DirectPaymentChannelAdapterTest`(L160,163) `PaymentManagedClientsTest`(L28,39,52,69,84) | 构造调用补 `new PaymentMockProperties(false, null, null)` | 仅测试 |

**不动** `configurationDescriptor()`（支付环境仍只提供官方/沙箱两项），使管理页 UI 与生产口径不变；Mock 联调通过 yml 部署商户配置完成。

**新增** `backend/src/test/resources/application-paymentmock.yml`（配合 `@ActiveProfiles({"test","paymentmock"})`，用于覆盖 `application-test.yml` 中 `direct.enabled=false`）：开启 `direct/alipay/wechat`，声明 `mock.enabled=true`、`mock.alipayGatewayUrl`/`wechatApiHostUrl` 指向 `http://127.0.0.1:18090`，并声明测试商户（`serverUrl` / `apiHostUrl` 指向本地 Mock）。`privateKeyPath`/`publicKeyPath`/`certificatePath` 需是可读磁盘路径，测试在 `@BeforeAll` 用 `@TempDir` 从 classpath 解出 PEM 与 p12。

**不做**：不新增生产回调端点（`docs/operations/直连付款码支付接入.md` 明确禁止公开回调）；异步到账不在本次范围。

## 8. 测试与验证

### Mock 侧（`mvn -f /Users/yangl/IdeaProjects/thirdparty-mock-server/pom.xml verify`）

- 现有 3 个测试类 + `ChsTestClient` 迁移到新包，**断言一字不改** → 证明 CHS 行为零回归。
- 新增 `AlipayGatewayContractTest`（`AlipayTestClient` 用 JDK HttpClient 组 form + RSA2 签请求）：断言 pay `code=10000` 且响应 sign 可用 Mock 支付宝公钥验通、query 返回 `TRADE_SUCCESS`、refund/refundQuery 字段齐全、非法 method 与坏签名被拒。
- 新增 `WxpayContractTest`（`WxpayTestClient` 组 XML + MD5 签）：断言 4 个路径字段齐全、响应签名可用 apiKey 验通、`trade_state` 分支、`refund_records` 命中、坏签名 `return_code=FAIL`。
- 新增 `MockAdminMultiProtocolTest`：`/mock/requests?protocol=alipay&op=…`、`/mock/config?protocol=all`、reset 清空三方。
- CA 并入后同一命令一并覆盖 CA：`com.rhn.mock.protocol.ca` 下 6 个测试类（协议契约、扫码/证书登录、签名任务、故障注入、管理端点、端到端验收）共 63 例，与本文档三个协议合计 **119 例**。
- 断言密钥材料自生成（测试内 `KeyPairGenerator`），不提交真实密钥；CA 的根/时间戳材料是**固定随包发布的一次性 throwaway**（`src/main/resources/mock/ca/`），终端证书现签、仅存内存。

### rhn 侧（证明"真实 SDK ↔ Mock"）

新增 `backend/src/test/java/com/rhn/billing/infrastructure/payment/PaymentMockContractIntegrationTest.java`，`@SpringBootTest` + `@ActiveProfiles({"test","paymentmock"})`，注入 `PaymentChannelRegistry` 后 `resolve("ALIPAY")`/`resolve("WECHAT")`，依次跑 `validate → initiate → query → refund → query(REFUND)`，断言 `InitiationResult.succeeded`（trade_no/transaction_id）、`QueryResult.succeeded`、`RefundResult.pending(out_refund_no)`。

启动 Mock 的方式：`@BeforeAll` 先探活 `127.0.0.1:18090/mock/health`，未启动则尝试以子进程运行 `../thirdparty-mock-server/target/thirdparty-mock-server-*.jar`，两者都不可用则 `Assumptions.assumeTrue(false)` 跳过。**这是已知限制**：跨仓库（两个独立 Maven 项目）无法在 CI 中自动编排，因此该用例是本地/联调证据，不是 CI 门禁。不采用"在 rhn 内再写一份协议桩"的做法——那会造成第二份协议实现并必然与 Mock 漂移。

验证命令：

```bash
# Mock 侧（唯一自动化主证据）
mvn -f /Users/yangl/IdeaProjects/thirdparty-mock-server/pom.xml verify
java -jar /Users/yangl/IdeaProjects/thirdparty-mock-server/target/thirdparty-mock-server-*.jar
curl -s localhost:18090/mock/health

# rhn 侧（含生产 src/main 改动，必须跑领域门禁）
./scripts/verify-scope.sh billing --list
./scripts/verify-scope.sh billing
mvn -f /Users/yangl/IdeaProjects/rhn/backend/pom.xml -pl rhn-app -am -Dspring.profiles.active=test \
  -Dtest=PaymentMockContractIntegrationTest test
```

## 9. 分阶段实施

| 阶段 | 内容 | 完成判据 | 回退 |
|---|---|---|---|
| 0 | `mv chs-mock-server thirdparty-mock-server`；artifactId 改名；拆 `core` / `protocol.chs` | `mvn verify` 31 测试全绿，行为与旧版等价 | 目录改名可整体回滚 |
| 1 | `core` 管理端点 + 配置命名空间多协议化（仍只有 chs） | 无参 `/mock/config` 与 `?infno=` 输出与旧版等价；Admin 测试通过 | 保留旧 `MockProperties` 作为兼容层 |
| 2 | 支付宝协议 + Mock 契约测试 + rhn `PaymentMockProperties` 白名单开关 + rhn 集成测试 | Mock `verify` 全绿；`verify-scope.sh billing` 通过；本地集成测试通过 | `mock.enabled=false` 即回到纯生产行为 |
| 3 | 微信 v2 协议 + Mock 契约测试 + rhn `apiHostUrl` 开关 + rhn 集成测试 | 同上 | 同上 |
| （非本计划阶段）CA | 由独立任务实现并并入同一进程（第 4 个协议插件） | 见 §1 / §11；`mvn verify` 含 CA 共 119 例全绿 | 删除 `protocol.ca` + `CaMockProperties` 注册 + `mock.ca` 配置即回到三协议 |

## 10. 风险与限制

1. **支付宝响应签名逐字节一致**（§5）——最大实现风险，需先写一个"签名串=发出子串"的单测再写业务。
2. **微信退款需 p12**——密码与 CN 都必须是 `mchId`，否则 `initSSLContext()` 直接抛异常，适配器返回 `uncertain()`。
3. **跨仓库验证缺口**——rhn 侧集成测试依赖本地 Mock 进程/jar，CI 默认跳过（§8）。
4. **rhn 生产面改动**——`PaymentMockProperties` 属 `src/main` 改动，虽然默认 `false` 且 `configurationDescriptor()` 未变，仍需 `verify-scope.sh billing`；`ArchitectureTest` 用 `DoNotIncludeTests`，新增测试类不触发架构规则，但改动生产 API 会触发 api-contract 检查。
5. **Mock 的语义边界**——Mock 只能自造渠道行为（异步到账、渠道侧状态机、对账文件），所有"渠道行为"结论仅代表 Mock 约定，不代表支付宝/微信真实行为，不能作为对接验收依据。

## 11. 非目标与范围变更

- 不做财政票据 Mock（契约未定义，见 §1）。
- **CA/BJCA Mock：状态已变更 —— 由非目标改为已实现**（原措辞为"不做 CA/BJCA Mock"）。原因：原判断依据是"BJCA 厂商适配器不存在、线上协议与加签方式未定义"，现在 rhn 侧 CA 基座已合入 main（`com.rhn.platform.cryptography` 的 `CaVendorAdapter` 及 7 个端口 + `docs/architecture/通用CA集成功能设计.md`），该任务据此**自拟**了一套 HTTP/JSON + SM2/SM3 协议（可真实验签）并实现为第 4 个协议插件 `protocol.ca`（`mock.ca.*` / `/ca/v1/**` / `/mock/ca/**`），因此"无对齐依据"不再成立。仍与真实厂商不一致：协议是自拟的，未模拟医网信等厂商的真实路径、字段、OAuth 与状态码，详见 `thirdparty-mock-server/docs/ca-mock-protocol.md` §10。
- **CA 遗留**：RHN 侧调用它的 `mock-ca` `CaVendorAdapter` 尚未实现（该文档 §9 列了 11 项适配点），因此 CA 的"真实 SDK ↔ Mock"端到端链路由 Mock 侧 63 例测试覆盖，尚无 rhn 侧联调证据。
- 不做真实渠道异步通知/对账文件仿真。
- 不改 rhn 生产默认行为、不新增公开回调端点、不改 `configurationDescriptor()`。
- 不做 Docker 交付（沿用单 jar）。
