# 医保 Mock 联调指引

目标：在没有医保专网时，用独立的 `rhn-thirdparty-mocks` 完整走通医保读卡/电子医保码 → 挂号结算 → 诊间结算 → 退费，并能稳定复现各类异常。
mock 服务本身的报文规则见 [医保Mock服务接口要求](医保Mock服务接口要求.md) 与 mock 项目的 `docs/chs-mock-protocol.md`。

## 1. 启动

1. 启动 mock（JDK 21，默认 `127.0.0.1:18090`）：`mvn spring-boot:run`（在 rhn-thirdparty-mocks 目录）。
2. 以 `oracle-local,insurance-mock` 两个 profile 启动后端：

```bash
cd backend && SPRING_PROFILES_ACTIVE=oracle-local,insurance-mock mvn -pl rhn-app spring-boot:run
```

mock 不在默认端口时设置 `RHN_INSURANCE_MOCK_URL=http://127.0.0.1:<端口>/hsa/api`。

`insurance-mock` profile（[application-insurance-mock.yml](../../backend/src/main/resources/application-insurance-mock.yml)）做三件事：
关闭进程内模拟客户端、启用指向 mock 的**正式网关客户端**（真实 HTTP 链路）、打开前端模拟入口开关 `rhn.billing.insurance.chs.simulator.enabled`。

## 2. 不影响正式接入的约束

- 模拟入口默认关闭；只有显式开启开关才会在挂号页出现「医保联调模拟」面板，前端靠 `GET /api/billing/insurance/simulator` 判断，关闭或查询失败时不渲染任何内容。
- 开关开启时，网关地址必须是本机回环地址，否则应用**启动失败**，避免联调开关与真实医保平台同时生效。
- 演示患者与目录对照只在 `db/oracle-local` 迁移里，不进入正式迁移目录。
- 该接口不进入对外 OpenAPI 契约（`@Hidden`）。

## 3. 演示数据

| 迁移 | 内容 |
| --- | --- |
| `V1_129_25__insurance_mock_demo_patients.sql` | 12 位「模拟·…」患者，健康档案号 `HRMOCK0001`~`HRMOCK0012`，医保个人编号为 `PSN-<TEST-*证件号>`，与 mock 1101 返回的 `psn_no` 一致 |
| `V1_129_26__insurance_mock_catalog_mapping.sql` | 为演示库已有诊疗项目和药品生成联调目录 `MOCK-CATALOG` 的医保对照（INSURANCE、EXACT） |

联调医保注册资料（机构 `MOCK0001`、科室 `MOCK-*`、医师编码）由 profile 的 `quick-submission.registrations` 提供，覆盖全科/内科/儿科/外科/中医/妇产科门诊，险种 310 与 390。
医师编码按登录账号匹配，已预置 `doctor`、`admin`、`registrar`、`cashier`、`nurse`；用其他账号办理挂号或接诊时，到 profile 里补一行。

## 4. 使用流程

1. 门诊挂号页顶部出现虚线框「医保联调模拟」（带 MOCK 徽标）。
2. 选择测试人员，点「模拟读卡」（社保卡）或「模拟医保码」（电子凭证）。
3. 系统先发真实的 1101 读证（凭证在后端内存保留 30 分钟，后续预结算要用），再定位对应的模拟患者并带入挂号，介质记为医保卡/电子医保码，费用类别自动切到医保。
4. 之后按本院医保结算时机走：挂号时结算（2201→2204→2206→2207）或并入诊间统一结算。

| 测试人员 | 预期 |
| --- | --- |
| TEST-310 职工医保·正常 | 个账余额 1850.00，完整结算与退费 |
| TEST-390 居民医保·正常 | 无个人账户 |
| TEST-MULTI | 多条参保，应取正常的职工险 |
| TEST-SUSPENDED | 读证成功但状态异常，挂号被拦截 |
| TEST-NOINSU | 1101 被拒，读卡失败提示 |
| TEST-REJECT-2206 | 预结算被拒 |
| TEST-IMBALANCE / TEST-MISSING-AMT | 结算金额不守恒 / 缺字段，应被拒绝入账 |
| TEST-SLOW / TEST-HTTP500 / TEST-BADJSON | 超时、500、非 JSON，结果未知需人工核对 |
| TEST-SIGN-EXPIRE | 首次业务交易后签到失效，客户端应自动重新签到 |

演示患者（HRMOCK0001~0012）可直接检索选人；按档案身份证鉴权时，mock 通过 `mock.chs.cert-aliases` 把身份证号映射到对应的 TEST-* 人员（返回 `PSN-TEST-*`，`certno` 仍回显身份证号），场景与上表一致。

mock 的状态在内存里，重启即清空；需要清场或查看已收报文，用面板里的「打开 Mock 控制台」。
`diagnosisRequired` 在 mock 中默认为 `false`（挂号时结算无需 2203A，无需手动配置）；仅在验证“平台要求挂号带诊断”的拒绝提示时，才经 `PUT /mock/config {"diagnosisRequired":true}` 打开，`POST /mock/reset` 复位。

## 5. 目录对照

联调目录已对演示库里现有的项目建立对照，可在「中心主数据 → 医保接入向导」查看覆盖率；新增项目在「标准映射管理」选择 `MOCK-CATALOG` 对照。
mock 不校验项目编码；乙/丙类按项目分类码是否含 `B`/`SPECIAL`/`SELF` 推断（进程内 mock），独立 mock 服务按请求里的 `chrgitm_lv` 处理。

## 6. 已知限制

- 迁移 SQL 按 Oracle 语法编写，未在本仓库的 H2 测试库执行；首次启动 `oracle-local` 时以 Flyway 结果为准。
- 诊间统一结算（VISIT_UNIFIED）没有单独的读证界面，依赖模拟读卡在挂号页预先完成 1101；凭证超过 30 分钟需重新读取。
- 模拟面板只在门诊挂号页提供。
