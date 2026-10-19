# 医保 Mock 服务接口要求

用途：在没有真实医保专网时，为「医保接入向导」联通探测和 `HttpChsNationalInsuranceClient` 提供可重复的端到端联调环境。
本文件只规定 mock 端必须满足的外部行为，字段名与现有客户端实际读取的字段对齐；金额类比例不代表真实政策。

## 1. 形态

- 独立进程（单 jar 或容器），默认端口 `18090`，状态保存在内存，重启即清空。
- 业务端点：`POST /hsa/api`（路径可配置），`Content-Type: application/json;charset=UTF-8`，HTTP 200 承载业务成功与业务拒绝。
- 管理端点见第 5 节，仅监听本机或受访问令牌保护。
- 可选：校验请求头 `X-Token`（值可配置），缺失或不符返回 HTTP 401，用于验证向导对「附加头」配置的探测。

## 2. 报文外壳

请求字段（均需校验存在，缺失返回 `infcode=-1`，`err_msg` 指明字段）：
`infno, msgid, mdtrtarea_admvs, insuplc_admdvs, recer_sys_code, dev_no, dev_safe_info, cainfo, signtype, infver, opter_type, opter, opter_name, inf_time, fixmedins_code, fixmedins_name, sign_no, input`

- `msgid` 须唯一，重复返回 `infcode=-1`。
- 除 `9001` 外，`sign_no` 必须是本服务签发且对应同一 `opter` 的值，否则 `infcode=-1`，`err_msg` 含“签到”。
- `inf_time` 格式 `yyyy-MM-dd HH:mm:ss`，错误则拒绝。

响应外壳：`{"infcode":0,"inf_refmsgid":"<msgid>","refmsg_time":"…","respond_time":"…","err_msg":"","output":{…}}`；失败时 `infcode=-1`，无需 `output`。

## 3. 交易（均有状态，顺序错误须拒绝）

| infno | input | output（客户端读取的字段） |
| --- | --- | --- |
| 9001 签到 | `signIn.{opter_no,mac,ip}` | `signinoutb.{sign_no,sign_time}`，同一 opter 重复签到返回新值并使旧值失效 |
| 1101 人员信息 | `data.{mdtrt_cert_type,mdtrt_cert_no,card_sn,begntime,psn_cert_type,certno,psn_name}` | `baseinfo.{psn_no,certno,psn_name,gend,brdy}`；`insuinfo[]`：`insutype,psn_insu_stas,balc,psn_type,insuplc_admdvs` |
| 2201 就诊登记 | `data.{psn_no,insutype,begntime,mdtrt_cert_type,mdtrt_cert_no,ipt_otp_no,atddr_no,dr_name,dept_code,dept_name,caty}` | `data.mdtrt_id`；psn_no 必须来自已成功的 1101，凭证须与 1101 一致 |
| 2203A 诊断上传 | `mdtrtinfo.{mdtrt_id,psn_no,med_type,begntime,main_cond_dscr,dise_codg,dise_name}`（注意不是 `data`）、`diseinfo[]` | `{}`；须先有 2201；无主诊断拒绝 |
| 2204 费用明细 | `feedetail[]`：`feedetl_sn,mdtrt_id,psn_no,chrg_bchno,fee_ocur_time,med_list_codg,medins_list_codg,det_item_fee_sumamt,cnt,pric,…` | `result[]`：每行 `feedetl_sn,chrgitm_lv`（`01`甲/`02`乙/`03`丙）；须先有 2203A；`det_item_fee_sumamt = cnt×pric` 不符则拒绝 |
| 2206 预结算 | `data.{mdtrt_id,psn_no,insutype,mdtrt_cert_type,mdtrt_cert_no,med_type,medfee_sumamt,psn_setlway,chrg_bchno,acct_used_flag}` | `setlinfo`，字段全集见下 |
| 2207 结算 | `data.{mdtrt_id,psn_no,insutype,chrg_bchno,acct_used_flag}` | `setlinfo`（同上，另含 `setl_time`），须先有 2206；同 `mdtrt_id` 重复结算拒绝 |
| 2208 结算撤销 | `data.{setl_id,mdtrt_id,psn_no}` | `setlinfo.setl_id`（撤销流水）；仅对已结算成功且未撤销的 `setl_id`；重复撤销 `infcode=-1`，`err_msg` 含“已撤销” |

`setlinfo` 必含（金额均为两位小数字符串）：
`setl_id, medfee_sumamt, fund_pay_sumamt, hifp_pay, hifob_pay, acct_pay, psn_cash_pay, inscp_scp_amt, fulamt_ownpay_amt, preselfpay_amt`，可选 `acct_mulaid_pay`。
**守恒约束**：`medfee_sumamt = fund_pay_sumamt + acct_pay + acct_mulaid_pay(缺省 0) + psn_cash_pay`，且 `fund_pay_sumamt ≥ hifp_pay + hifob_pay`。2207 的 `setl_time` 为 `yyyy-MM-dd HH:mm:ss`。

计算规则建议（可配置）：甲类统筹 80%，乙类先行自付 15% 后统筹 70%，丙类全自费；剩余部分 `acct_used_flag=1` 且职工险(310)时优先个账，其余现金；居民险(390)无个账。

## 4. 测试人员与故障场景

通过 1101 的证件号（`mdtrt_cert_no`）选择人员与场景，便于向导和自动化测试稳定复现：

| 证件号／token | 行为 |
| --- | --- |
| `TEST-310` | 职工医保，正常，个账余额 1850.00 |
| `TEST-390` | 居民医保，正常，无个账 |
| `TEST-MULTI` | `insuinfo` 返回两条（一条终止、一条正常），用于验证取正常参保 |
| `TEST-SUSPENDED` | `psn_insu_stas=2` |
| `TEST-NOINSU` | `infcode=-1`，无参保信息 |
| `TEST-REJECT-2206` | 1101 正常，2206 返回 `infcode=-1`（如“存在未结算记录”） |
| `TEST-IMBALANCE` | 2206/2207 返回金额不守恒 |
| `TEST-MISSING-AMT` | 2206 缺 `acct_pay` 字段 |
| `TEST-SLOW` | 2206 延迟超过 30 秒（验证超时） |
| `TEST-HTTP500` | 2207 返回 HTTP 500 |
| `TEST-BADJSON` | 2207 返回非 JSON 文本 |
| `TEST-SIGN-EXPIRE` | 首次业务交易后使 `sign_no` 失效，下一次返回含“签到”的拒绝 |

另提供全局开关（管理端设置）：强制所有交易延迟 N 毫秒、强制返回指定 `infcode/err_msg`。

## 5. 管理端点

- `POST /mock/reset`：清空全部状态与已收报文。
- `GET /mock/requests?infno=&limit=`：返回已收原始请求与响应，字段 `time, infno, msgid, httpStatus, request, response`，用于自动化断言与向导的报文对照。
- `GET/PUT /mock/config`：读写计算比例、`X-Token`、延迟与强制应答开关。
- `GET /mock/health`：存活检查。

## 6. 我方对接配置（示例，值均为测试值）

```yaml
rhn:
  billing:
    insurance:
      chs:
        gateway:
          enabled: true
          base-url: http://localhost:18090/hsa/api
          fixmedins-code: MOCK0001
          fixmedins-name: 联调测试医院
          mdtrtarea-admvs: "360100"
          recer-sys-code: MOCKSYS
          default-operator: MOCKOP
          sign-in-mac: "00-00-00-00-00-01"
          sign-in-ip: 127.0.0.1
          headers:
            X-Token: mock-token
          probe-settlement-enabled: true   # 仅联调结算探测（2207/2208）时开启
```

## 7. 验收

- 用 `TEST-310` 走通 9001 → 1101 → 2201 → 2203A → 2204 → 2206 → 2207 → 2208，`/mock/requests` 中各报文字段齐全。
- 第 4 节每个场景都能稳定触发对应行为。
- 任一顺序错误、字段缺失、守恒不平的请求均返回 `infcode=-1`，不得返回成功。
- 医保接入向导「接口联通探测」A～C 步全部通过；将 `probe-settlement-enabled` 设为 true 后 D 步通过（2207 成功后 2208 自动撤销）。参考实现：测试代码 `ChsGatewayStub`，行为即本文第 2～4 节。

## 8. 挂号场景补充（挂号时医保结算）

挂号时结算不携带诊断，对 mock 有以下补充要求：

- **2202 门诊挂号撤销**：`input.data.{mdtrt_id,psn_no,ipt_otp_no}`，`output` 为空对象即可；`mdtrt_id` 须已登记（2201），重复撤销 `infcode=-1`；已结算且未撤销的就诊拒绝撤销（先 2208）。
- **2204 在未上传 2203A 时可接受**：挂号场景只做 2201 → 2204 → 2206 → 2207，建议提供开关（如 `mock.diagnosis-required`，默认 `true`），关闭后 2204 不要求先有诊断；开启时用于验证“平台要求挂号带诊断”时的拒绝提示。
- **同一就诊的第二次结算**：诊间结算沿用挂号时的 `mdtrt_id`（不再 2201），应允许同一 `mdtrt_id` 在前一笔已结算、后一笔 2204/2206/2207 时继续（含 2203A 补传诊断）；仍应拒绝对同一笔结算的重复 2207。
- **2208 校验**：建议核对 `mdtrt_id`、`psn_no` 与原结算一致。
- 现有已知差异（可后续补齐）：暂停参保人员（`TEST-SUSPENDED`）在 2201/2206 仍成功；`TEST-SIGN-EXPIRE` 每次业务交易后都使签到失效。
