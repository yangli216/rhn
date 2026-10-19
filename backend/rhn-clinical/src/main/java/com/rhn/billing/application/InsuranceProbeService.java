package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceProbeViews.*;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceDiagnosis;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceInstruction;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceLine;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceReversal;
import com.rhn.billing.infrastructure.insurance.chs.ChsExchange;
import com.rhn.billing.infrastructure.insurance.chs.ChsGatewayProperties;
import com.rhn.billing.infrastructure.insurance.chs.ChsInsuranceSettlementAdapter;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PersonInfoRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsRejectedException;
import com.rhn.billing.infrastructure.insurance.chs.ChsTransportException;
import com.rhn.billing.infrastructure.insurance.chs.HttpChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.MockChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * 上线前的医保接口联通探测。每一步都经 {@link HttpChsNationalInsuranceClient} 与适配器发出真实报文，不另写协议实现。
 *
 * <p>安全边界：仅在正式网关模式下可用；证件号等凭证只在本次调用及 1101 后的客户端内存中使用，不落库不记日志不回显；
 * 探测过程中的报文返回给页面前一律脱敏；2207/2208 须部署配置允许、请求显式确认且输入预结算探测单号，结算后立即自动撤销。
 * 请求本身由平台审计过滤器记录操作者与路径，结果摘要另写专用审计日志（不含凭证与报文）。
 */
@Service
public class InsuranceProbeService {
    private static final Logger audit = LoggerFactory.getLogger("rhn.insurance.probe.audit");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmss").withZone(ZoneId.of("Asia/Shanghai"));
    private static final Duration SESSION_TTL = Duration.ofMinutes(30);
    private static final String REVERSAL_REASON = "联通探测自动撤销";
    public static final String AUTHORITY = "INSURANCE_PROBE.EXECUTE";

    private final NationalInsuranceClient client;
    private final ObjectProvider<ChsGatewayProperties> properties;
    private final ObjectProvider<ChsInsuranceSettlementAdapter> adapter;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec json;
    private final Clock clock;
    private final Map<String, ProbeSession> sessions = new ConcurrentHashMap<>();

    private record PendingSettlement(InsuranceInstruction instruction, String externalPreSettlementNo) {}
    private record ProbeSession(String psnNo, String insutype, Instant expiresAt, PendingSettlement pending) {}

    @org.springframework.beans.factory.annotation.Autowired
    InsuranceProbeService(NationalInsuranceClient client, ObjectProvider<ChsGatewayProperties> properties,
                          ObjectProvider<ChsInsuranceSettlementAdapter> adapter, ExecutionContextProvider contextProvider,
                          JsonCodec json) {
        this(client, properties, adapter, contextProvider, json, Clock.systemUTC());
    }

    InsuranceProbeService(NationalInsuranceClient client, ObjectProvider<ChsGatewayProperties> properties,
                          ObjectProvider<ChsInsuranceSettlementAdapter> adapter, ExecutionContextProvider contextProvider,
                          JsonCodec json, Clock clock) {
        this.client = client; this.properties = properties; this.adapter = adapter;
        this.contextProvider = contextProvider; this.json = json; this.clock = clock;
    }

    public ProbeCapability capability() {
        ExecutionContext context = requireAuthorized();
        String mode = mode();
        var props = gatewayProperties();
        boolean available = client instanceof HttpChsNationalInsuranceClient && props != null && adapter.getIfAvailable() != null;
        String reason = available ? null : switch (mode) {
            case "MOCK" -> "当前使用进程内模拟客户端（mock-enabled），不经过 HTTP，无法探测网关。联调请关闭 mock-enabled，启用 gateway 并将 base-url 指向医保平台或独立 mock 服务";
            case "UNAVAILABLE" -> "正式网关未启用，无法探测。请配置 rhn.billing.insurance.chs.gateway.* 并将 enabled 设为 true";
            default -> "医保适配器未装配，无法探测";
        };
        boolean settlementAllowed = available && props.probeSettlementEnabled();
        String settlementReason = !available ? reason : settlementAllowed ? null
                : "结算探测（2207/2208）未开放。仅在使用平台测试人员时，才将 rhn.billing.insurance.chs.gateway.probe-settlement-enabled 设为 true";
        audit.info("capability actor={} org={} mode={} available={}", context.actor(), context.organizationId(), mode, available);
        return new ProbeCapability(available, mode, modeText(mode), reason, props != null && props.signInRequired(),
                settlementAllowed, settlementReason);
    }

    public ProbeStepResult run(String step, ProbeRequest request) {
        ExecutionContext context = requireAuthorized();
        ProbeCapability capability = capability();
        String normalized = step == null ? "" : step.trim().toUpperCase(java.util.Locale.ROOT);
        if (!List.of("SIGN_IN", "PERSON", "PRE_SETTLE", "SETTLE").contains(normalized)) {
            throw badRequest("INSURANCE_PROBE_STEP_UNKNOWN", "未知的探测步骤");
        }
        Instant started = clock.instant();
        if (!capability.available()) return blocked(normalized, started, capability.reason());
        String key = context.tenantId() + ":" + context.organizationId() + ":" + context.actor();
        ProbeStepResult result = switch (normalized) {
            case "SIGN_IN" -> signIn(started);
            case "PERSON" -> person(key, started, request == null ? null : request.person());
            case "PRE_SETTLE" -> preSettle(key, started, request == null ? null : request.preSettle());
            default -> settle(key, started, capability, request == null ? null : request.settle());
        };
        audit.info("step actor={} org={} step={} status={} exchanges={} corr={}", context.actor(), context.organizationId(), normalized,
                result.status(), result.exchanges().stream().map(e -> e.infno() + ":" + e.outcome()).toList(), context.correlationId());
        return result;
    }

    // ==================== 步骤 ====================

    private ProbeStepResult signIn(Instant started) {
        var http = (HttpChsNationalInsuranceClient) client;
        if (!http.signInRequired()) {
            return result("SIGN_IN", started, "SKIPPED", "配置为无需签到（sign-in-required=false），未发出任何交易",
                    "网关连通性将在下一步 1101 人员鉴权中验证", List.of(), List.of());
        }
        var exchanges = new ArrayList<ProbeExchange>();
        return attempt("SIGN_IN", started, exchanges, () -> {
            http.observe(e -> exchanges.add(view(e)), () -> { http.forceSignIn(); return null; });
            return result("SIGN_IN", started, "PASS", "网关可达，9001 签到成功", null, List.of(), exchanges);
        });
    }

    private ProbeStepResult person(String key, Instant started, ProbePersonInput input) {
        if (input == null || blank(input.certType()) || blank(input.certNo())) {
            return blocked("PERSON", started, "请填写测试人员的凭证类型和证件号码／电子凭证 token");
        }
        var exchanges = new ArrayList<ProbeExchange>();
        sessions.remove(key);
        return attempt("PERSON", started, exchanges, () -> {
            var person = ((HttpChsNationalInsuranceClient) client).observe(e -> exchanges.add(view(e)),
                    () -> client.queryPersonInfo(new PersonInfoRequest(input.certType().trim(), input.certNo().trim(),
                            input.personName() == null ? null : input.personName().trim())));
            sessions.put(key, new ProbeSession(person.psnNo(), person.insutype(), clock.instant().plus(SESSION_TTL), null));
            List<ProbeFact> facts = List.of(new ProbeFact("险种", person.insutypeName() + "（" + person.insutype() + "）"),
                    new ProbeFact("参保状态", String.valueOf(person.status())));
            boolean normal = "NORMAL".equals(person.status());
            return result("PERSON", started, normal ? "PASS" : "FAIL", normal ? "1101 鉴权成功，参保状态正常" : "1101 鉴权成功，但参保状态非正常",
                    normal ? null : "该测试人员当前不是正常参保状态，预结算会被平台拒绝，请更换测试人员", facts, exchanges);
        });
    }

    private ProbeStepResult preSettle(String key, Instant started, ProbePreSettleInput input) {
        ProbeSession session = session(key);
        if (session == null) return blocked("PRE_SETTLE", started, "请先成功完成『人员鉴权』（鉴权凭证 30 分钟内有效）");
        String invalid = validate(input);
        if (invalid != null) return blocked("PRE_SETTLE", started, invalid);
        var props = gatewayProperties();
        String operator = blank(input.practitionerCode()) ? props.defaultOperator() : input.practitionerCode().trim();
        String settlementNo = "PROBE" + STAMP.format(clock.instant()) + GlobalIds.randomSuffix(4).toUpperCase(java.util.Locale.ROOT);
        var lines = new ArrayList<InsuranceLine>();
        BigDecimal gross = BigDecimal.ZERO;
        long no = 0;
        for (var line : input.lines()) {
            BigDecimal amount = line.quantity().multiply(line.unitPrice()).setScale(6, RoundingMode.HALF_UP).stripTrailingZeros();
            if (amount.scale() < 2) amount = amount.setScale(2, RoundingMode.UNNECESSARY);
            lines.add(new InsuranceLine(++no, no, line.itemCode().trim(), line.insuranceItemCode().trim(), line.itemName().trim(),
                    line.quantity(), line.unitPrice(), amount, "PROBE", Map.of()));
            gross = gross.add(amount);
        }
        final BigDecimal total = gross;
        long probeId = GlobalIds.next();
        var instruction = new InsuranceInstruction(probeId, probeId, settlementNo, "PROBE-" + settlementNo, null, probeId, null, probeId,
                props.mdtrtareaAdmvs(), session.insutype(), props.fixmedinsCode(), input.departmentCode().trim(), operator,
                clock.instant(), null, "PROBE", lines, total, "CNY", "PROBE-" + settlementNo, session.psnNo(),
                List.of(new InsuranceDiagnosis("PRIMARY", 1, input.diagnosisCode().trim(), input.diagnosisName().trim())));

        var exchanges = new ArrayList<ProbeExchange>();
        return attempt("PRE_SETTLE", started, exchanges, () -> {
            InsuranceResult outcome = ((HttpChsNationalInsuranceClient) client).observe(e -> exchanges.add(view(e)),
                    () -> adapter.getObject().preSettle(instruction));
            if (outcome.outcome() != InsuranceResult.Outcome.SUCCEEDED) {
                return result("PRE_SETTLE", started, "FAIL", "预结算失败：" + nonBlank(outcome.errorMessage(), outcome.errorCode()),
                        exchangeHint(exchanges, hintForError(outcome.errorCode(), outcome.errorMessage())), List.of(), exchanges);
            }
            sessions.put(key, new ProbeSession(session.psnNo(), session.insutype(), clock.instant().plus(SESSION_TTL),
                    new PendingSettlement(instruction, outcome.externalSettlementNo())));
            return result("PRE_SETTLE", started, "PASS", "2201→2203A→2204→2206 预结算全链路成功，资金分摊守恒", null,
                    List.of(new ProbeFact("探测单号", settlementNo), new ProbeFact("费用总额", money(total)),
                            new ProbeFact("统筹基金", money(outcome.insuranceFundAmount())), new ProbeFact("个人账户", money(outcome.personalAccountAmount())),
                            new ProbeFact("个人现金", money(outcome.patientCashAmount())), new ProbeFact("其他基金", money(outcome.otherFundAmount()))),
                    exchanges);
        });
    }

    private ProbeStepResult settle(String key, Instant started, ProbeCapability capability, ProbeSettleInput input) {
        if (!capability.settlementAllowed()) return blocked("SETTLE", started, capability.settlementReason());
        ProbeSession session = session(key);
        if (session == null || session.pending() == null) return blocked("SETTLE", started, "请先成功完成『预结算全链路』");
        String settlementNo = session.pending().instruction().settlementNo();
        if (input == null || !input.confirmed() || !settlementNo.equals(input.confirmation() == null ? null : input.confirmation().trim())) {
            return blocked("SETTLE", started, "结算探测需勾选确认，并逐字输入预结算探测单号 " + settlementNo);
        }
        sessions.put(key, new ProbeSession(session.psnNo(), session.insutype(), session.expiresAt(), null)); // 单次有效，防止重复结算
        var pending = session.pending();
        var exchanges = new ArrayList<ProbeExchange>();
        return attempt("SETTLE", started, exchanges, () -> {
            var http = (HttpChsNationalInsuranceClient) client;
            InsuranceResult settled = http.observe(e -> exchanges.add(view(e)),
                    () -> adapter.getObject().settle(pending.instruction(), pending.externalPreSettlementNo()));
            if (settled.outcome() != InsuranceResult.Outcome.SUCCEEDED) {
                return result("SETTLE", started, "FAIL", "2207 结算失败：" + nonBlank(settled.errorMessage(), settled.errorCode()),
                        exchangeHint(exchanges, hintForError(settled.errorCode(), settled.errorMessage())),
                        List.of(new ProbeFact("探测单号", settlementNo)), exchanges);
            }
            var instruction = pending.instruction();
            InsuranceResult reversed = http.observe(e -> exchanges.add(view(e)), () -> adapter.getObject().reverse(new InsuranceReversal(
                    instruction.claimId(), instruction.settlementId(), settlementNo, "PROBE-REV-" + settlementNo,
                    instruction.regionCode(), instruction.insuranceTypeCode(), settled.externalSettlementNo(), instruction.grossAmount(),
                    REVERSAL_REASON, instruction.correlationId(), instruction.residentId(), instruction.coverageId(),
                    instruction.practitionerCode(), "CNY", settled.insuranceFundAmount(), settled.personalAccountAmount(),
                    settled.patientCashAmount(), settled.otherFundAmount(), instruction.externalPersonNo())));
            var facts = List.of(new ProbeFact("探测单号", settlementNo), new ProbeFact("医保结算流水", settled.externalSettlementNo()));
            if (reversed.outcome() != InsuranceResult.Outcome.SUCCEEDED) {
                return result("SETTLE", started, "FAIL", "2207 结算成功，但 2208 自动撤销失败，该测试结算仍然有效",
                        "请立即在医保平台按流水 " + settled.externalSettlementNo() + " 人工撤销。撤销失败原因："
                                + nonBlank(reversed.errorMessage(), reversed.errorCode()), facts, exchanges);
            }
            return result("SETTLE", started, "PASS", "2207 结算与 2208 自动撤销均成功", null, facts, exchanges);
        });
    }

    // ==================== 执行与报文处理 ====================

    /** 执行一步探测：已收集的往返记录随失败一并返回，传输异常转为带提示的失败结果而不是 5xx。 */
    private ProbeStepResult attempt(String step, Instant started, List<ProbeExchange> exchanges, Supplier<ProbeStepResult> action) {
        try {
            return action.get();
        } catch (ChsRejectedException rejected) {
            return result(step, started, "FAIL", "平台拒绝：" + rejected.getMessage(), hintFor(lastInfno(exchanges), ChsExchange.Outcome.REJECTED,
                    rejected.getMessage(), null), List.of(), exchanges);
        } catch (ChsTransportException failure) {
            return result(step, started, "FAIL", failure.getMessage(), hintFor(lastInfno(exchanges), failure.kind(), null,
                    exchanges.isEmpty() ? null : exchanges.getLast().httpStatus()), List.of(), exchanges);
        } catch (BusinessException business) {
            return result(step, started, "FAIL", business.getMessage(), hintForError(business.code(), business.getMessage()), List.of(), exchanges);
        } catch (IllegalStateException incomplete) {
            return result(step, started, "FAIL", incomplete.getMessage(),
                    "平台已应答但回执不满足协议要求（缺字段、金额缺失或不平衡）。对照下方回执报文与接口规范，或联系平台技术支持", List.of(), exchanges);
        }
    }

    private ProbeExchange view(ChsExchange exchange) {
        String request = pretty(exchange.request());
        String response = exchange.outcome() == ChsExchange.Outcome.BAD_JSON || exchange.outcome() == ChsExchange.Outcome.HTTP_STATUS
                ? ChsExchangeRedactor.describeRaw(exchange.response()) : pretty(exchange.response());
        return new ProbeExchange(exchange.infno(), infnoText(exchange.infno()), exchange.startedAt(), exchange.durationMs(),
                exchange.httpStatus(), exchange.infcode(), exchange.errMsg(), exchange.outcome().name(), outcomeText(exchange.outcome()),
                exchange.outcome() == ChsExchange.Outcome.OK ? null : hintFor(exchange.infno(), exchange.outcome(), exchange.errMsg(), exchange.httpStatus()),
                request, response);
    }

    private String pretty(String raw) {
        if (raw == null || raw.isBlank()) return "";
        try { return json.write(ChsExchangeRedactor.redact(json.readTree(raw))); }
        catch (RuntimeException exception) { return ChsExchangeRedactor.describeRaw(raw); }
    }

    static String hintFor(String infno, ChsExchange.Outcome outcome, String errMsg, Integer httpStatus) {
        return switch (outcome) {
            case TIMEOUT -> "网络超时：核对 base-url 是否可达、专网或防火墙放行，必要时调大 read-timeout";
            case NETWORK -> "无法连接网关：核对 base-url 的主机、端口与网络路由，确认医保专网或 VPN 已连通";
            case HTTP_STATUS -> "网关返回 HTTP " + httpStatus + "：核对 base-url 的路径，以及省平台要求的附加请求头（headers）鉴权";
            case BAD_JSON -> "回执不是有效 JSON：可能被代理、登录页或错误页拦截，确认地址指向的是接口网关";
            case INCOMPLETE -> "回执缺少 output，对照接口规范核对该交易的回执结构";
            case REJECTED -> "9001".equals(infno) ? "签到被拒绝：多半是默认经办人（default-operator）、签到 mac／ip 与平台登记资料不一致"
                    : errMsg != null && errMsg.contains("签到") ? "签到已失效或不属于该经办人，请重新执行『网关连通与签到』"
                    : "平台拒绝该交易：按平台返回的错误信息核对本次入参（凭证、险种、诊断、费用行及医保目录编码）";
            case OK -> null;
        };
    }

    private static String hintForError(String code, String message) {
        if (code != null && code.startsWith("CHS_REJECTED_")) {
            return message != null && message.contains("签到") ? "签到已失效或不属于该经办人，请重新执行『网关连通与签到』"
                    : "平台拒绝该交易：按平台返回的错误信息核对本次入参（凭证、险种、诊断、费用行及医保目录编码）";
        }
        if ("CHS_REQUEST_CONTEXT_UNCONFIRMED".equals(code)) return "本次请求资料未通过本地核验，按提示补全后重试（未向平台发出该交易）";
        return null;
    }

    /** 失败的往返自带更准确的原因判断（超时、HTTP 异常等），优先于按错误码的泛化提示。 */
    private static String exchangeHint(List<ProbeExchange> exchanges, String fallback) {
        for (int i = exchanges.size() - 1; i >= 0; i--) if (exchanges.get(i).hint() != null) return exchanges.get(i).hint();
        return fallback;
    }

    private static String lastInfno(List<ProbeExchange> exchanges) { return exchanges.isEmpty() ? null : exchanges.getLast().infno(); }

    // ==================== 小工具 ====================

    private ProbeStepResult result(String step, Instant started, String status, String summary, String hint,
                                   List<ProbeFact> facts, List<ProbeExchange> exchanges) {
        return new ProbeStepResult(step, stepText(step), status, statusText(status), summary, hint, started,
                Duration.between(started, clock.instant()).toMillis(), List.copyOf(facts), List.copyOf(exchanges));
    }

    private ProbeStepResult blocked(String step, Instant started, String reason) {
        return result(step, started, "BLOCKED", reason, null, List.of(), List.of());
    }

    private ProbeSession session(String key) {
        ProbeSession session = sessions.get(key);
        if (session == null || session.expiresAt().isBefore(clock.instant())) { sessions.remove(key); return null; }
        return session;
    }

    private static String validate(ProbePreSettleInput input) {
        if (input == null || blank(input.departmentCode()) || blank(input.diagnosisCode()) || blank(input.diagnosisName())) {
            return "请填写科室编码、主诊断编码与名称";
        }
        if (input.lines() == null || input.lines().isEmpty() || input.lines().size() > 20) return "请录入 1～20 条测试费用行";
        for (var line : input.lines()) {
            if (line == null || blank(line.itemCode()) || blank(line.insuranceItemCode()) || blank(line.itemName())
                    || line.quantity() == null || line.quantity().signum() <= 0 || line.unitPrice() == null || line.unitPrice().signum() <= 0
                    || line.quantity().scale() > 4 || line.unitPrice().scale() > 4) {
                return "费用行需填写项目编码、医保目录编码、名称，数量与单价必须大于零（最多 4 位小数）";
            }
        }
        return null;
    }

    private ExecutionContext requireAuthorized() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasAuthority(AUTHORITY)) throw com.rhn.shared.api.BusinessErrors.forbidden("INSURANCE_PROBE_FORBIDDEN", "需要医保联通探测权限");
        return context;
    }

    private ChsGatewayProperties gatewayProperties() { return properties.getIfAvailable(); }

    private String mode() {
        if (client instanceof HttpChsNationalInsuranceClient) return "GATEWAY";
        if (client instanceof MockChsNationalInsuranceClient) return "MOCK";
        return "UNAVAILABLE";
    }

    private static String modeText(String mode) {
        return switch (mode) { case "GATEWAY" -> "正式网关"; case "MOCK" -> "模拟客户端（进程内）"; default -> "未接入"; };
    }

    private static String stepText(String step) {
        return switch (step) { case "SIGN_IN" -> "网关连通与签到"; case "PERSON" -> "人员鉴权"; case "PRE_SETTLE" -> "预结算全链路"; default -> "结算与自动撤销"; };
    }

    private static String statusText(String status) {
        return switch (status) { case "PASS" -> "通过"; case "FAIL" -> "失败"; case "SKIPPED" -> "已跳过"; default -> "未执行"; };
    }

    private static String infnoText(String infno) {
        return switch (infno) {
            case "9001" -> "签到"; case "1101" -> "人员信息"; case "2201" -> "就诊登记"; case "2203A" -> "就诊诊断上传";
            case "2204" -> "费用明细上传"; case "2206" -> "预结算"; case "2207" -> "结算"; case "2208" -> "结算撤销"; default -> infno;
        };
    }

    private static String outcomeText(ChsExchange.Outcome outcome) {
        return switch (outcome) {
            case OK -> "成功"; case REJECTED -> "平台拒绝"; case TIMEOUT -> "超时"; case NETWORK -> "连接失败";
            case HTTP_STATUS -> "HTTP 异常"; case BAD_JSON -> "回执非 JSON"; case INCOMPLETE -> "回执不完整";
        };
    }

    private static String money(BigDecimal value) { return value == null ? "—" : value.setScale(2, RoundingMode.HALF_UP).toPlainString(); }

    private static String nonBlank(String first, String second) { return blank(first) ? String.valueOf(second) : first; }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
}
