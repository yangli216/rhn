package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.domain.InsuranceClaim;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceInstruction;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceReversal;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.*;
import com.rhn.shared.api.BusinessErrors;
import com.rhn.shared.json.JsonCodec;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * 国家医保信息平台统一接口（HTTP/JSON）正式客户端。
 *
 * <p>报文外壳、9001 签到、1101 人员信息、2201 就诊登记、2203A 就诊诊断上传、2204 费用明细上传、2206 预结算、2207 结算与 2208 结算撤销
 * 按国家医保接口规范组装。仅在 {@code rhn.billing.insurance.chs.gateway.enabled=true} 时装配，与 Mock 客户端互斥。
 *
 * <p>外部流水约定：对核心域保存的预结算号、结算号为 {@code 就诊ID:结算ID}，以便 2207/2208 取回 mdtrt_id，
 * 不需要为协议字段改动收费表结构；核心域只把它当作不透明编号。
 *
 * <p>人员鉴权凭证（电子凭证 token、身份证、社保卡号）仅在 1101 成功后按医保人员编号短暂保留在内存，
 * 用于紧随其后的就诊登记，不落库、不写日志。因此预结算须在同一节点、凭证有效期内完成。
 */
@Component
@EnableConfigurationProperties(ChsGatewayProperties.class)
@ConditionalOnProperty(name = "rhn.billing.insurance.chs.gateway.enabled", havingValue = "true")
public class HttpChsNationalInsuranceClient implements NationalInsuranceClient {
    /** 传输层缝隙：生产使用 JDK HttpClient，测试可替换以脱离网络。 */
    interface Transport {
        Response post(URI uri, Map<String, String> headers, String body) throws IOException, InterruptedException;
        record Response(int status, String body) {}
    }

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final Pattern INSUTYPE = Pattern.compile("\\d{3}");
    private static final String REF_SEPARATOR = ":";

    private final ChsGatewayProperties properties;
    private final Transport transport;
    private final Clock clock;
    private final ZoneId zone;
    private final URI endpoint;
    private final JsonCodec json;
    /** msgid 须全局唯一：进程内共用计数，起点随机，避免重启或多节点在同一秒从 0001 重复起号。 */
    private static final AtomicInteger sequence = new AtomicInteger(java.util.concurrent.ThreadLocalRandom.current().nextInt(10000));
    private final Map<String, String> signNos = new ConcurrentHashMap<>();
    private final Map<String, Credential> credentials = new ConcurrentHashMap<>();
    private final ThreadLocal<Consumer<ChsExchange>> observer = new ThreadLocal<>();

    private record Credential(String certType, String certNo, Map<String, String> insuplcByInsutype, Instant expiresAt) {
        @Override public String toString() { return "Credential[REDACTED]"; }
    }

    @org.springframework.beans.factory.annotation.Autowired
    public HttpChsNationalInsuranceClient(ChsGatewayProperties properties, JsonCodec json) {
        this(properties, json, httpTransport(properties), Clock.systemUTC());
    }

    HttpChsNationalInsuranceClient(ChsGatewayProperties properties, JsonCodec json, Transport transport, Clock clock) {
        this.json = json; this.properties = properties; this.transport = transport; this.clock = clock;
        this.zone = ZoneId.of(properties.zone());
        this.endpoint = URI.create(properties.baseUrl().trim());
    }

    private static Transport httpTransport(ChsGatewayProperties properties) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build();
        return (uri, headers, body) -> {
            var builder = HttpRequest.newBuilder(uri).timeout(properties.readTimeout())
                    .header("Content-Type", "application/json;charset=UTF-8")
                    .POST(HttpRequest.BodyPublishers.ofString(body));
            headers.forEach(builder::header);
            var response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            return new Transport.Response(response.statusCode(), response.body());
        };
    }

    // ==================== 请求准备：只使用有来源的资料 ====================

    @Override
    public PreSettleRequest preparePreSettle(InsuranceInstruction input) {
        String psnNo = requirePersonNo(input.externalPersonNo());
        String insutype = requireInsutype(input.insuranceTypeCode());
        Credential credential = requireCredential(psnNo, insutype);
        String operator = requireOperator(input.practitionerCode());
        String insuplc = credential.insuplcByInsutype().get(insutype);
        String time = TIME.format(LocalDateTime.ofInstant(input.serviceStartedAt() == null ? clock.instant() : input.serviceStartedAt(), zone));

        // 诊间场景先核实诊断，避免登记就诊后才发现无法上传；挂号场景发生在接诊之前，没有诊断也不补造，不上传 2203A。
        boolean registrationScene = input.registrationScene();
        var primary = registrationScene ? null : input.diagnoses().stream()
                .filter(d -> "PRIMARY".equals(d.diagnosisTypeCode())).findFirst()
                .orElseThrow(() -> BusinessErrors.conflict("CHS_REQUEST_CONTEXT_UNCONFIRMED",
                        "缺少与医保申请一致的已确认主诊断，不能上传就诊诊断"));

        // 2201 就诊登记：取得 mdtrt_id；挂号时已登记且未撤销的就诊直接沿用，避免重复登记
        String reused = !registrationScene && input.reusableVisitId() != null && !input.reusableVisitId().isBlank()
                ? input.reusableVisitId().trim() : null;
        String mdtrtId = reused != null ? reused : registerVisit(input, psnNo, insutype, credential, operator, insuplc, time);

        // 2203A 门诊就诊信息（含诊断）上传：诊断必须来自与申请摘要一致的已确认诊断
        if (!registrationScene) {
            try { uploadVisit(input, primary, mdtrtId, psnNo, operator, insuplc, time); }
            catch (ChsRejectedException rejected) {
                // 沿用的挂号登记已在平台失效（如平台侧数据被重置），或挂号时读错凭证导致登记人员与当前参保人不一致：
                // 重新登记就诊后再上传，不让收费员卡在试算。
                if (reused == null || !InsuranceClaim.visitRegistrationStale(rejected.getMessage())) throw rejected;
                mdtrtId = registerVisit(input, psnNo, insutype, credential, operator, insuplc, time);
                uploadVisit(input, primary, mdtrtId, psnNo, operator, insuplc, time);
            }
        }

        // 2204 费用明细上传：回执给出每行的收费项目等级
        ObjectNode upload = JsonNodeFactory.instance.objectNode();
        var detail = upload.putArray("feedetail");
        for (var line : input.lines()) {
            var item = detail.addObject();
            item.put("feedetl_sn", String.valueOf(line.settlementLineId())); item.put("mdtrt_id", mdtrtId);
            item.put("psn_no", psnNo); item.put("chrg_bchno", input.settlementNo());
            item.put("rxno", String.valueOf(line.settlementLineId())); item.put("fee_ocur_time", time);
            item.put("med_list_codg", line.insuranceItemCode()); item.put("medins_list_codg", line.itemCode());
            item.put("det_item_fee_sumamt", line.amount()); item.put("cnt", line.quantity()); item.put("pric", line.unitPrice());
            item.put("bilg_dept_codg", input.departmentCode()); item.put("bilg_dept_name", input.departmentCode());
            item.put("bilg_dr_codg", operator); item.put("bilg_dr_name", operator);
            item.put("hosp_appr_flag", "2");
        }
        JsonNode uploaded = call("2204", operator, insuplc, upload);
        Map<String, JsonNode> levels = new HashMap<>();
        for (JsonNode row : first(uploaded, "result", "data", "feedetail")) levels.put(text(row.path("feedetl_sn")), row);

        List<FeedetItem> items = new ArrayList<>();
        for (var line : input.lines()) {
            JsonNode row = levels.get(String.valueOf(line.settlementLineId()));
            if (row == null) throw new IllegalStateException("2204 未返回费用行 " + line.settlementLineId() + " 的审核结果");
            items.add(new FeedetItem(line.settlementLineId(), line.itemCode(), line.insuranceItemCode(), line.itemName(),
                    listCategory(line.insuranceItemCode()), itemLevel(text(row.path("chrgitm_lv"))),
                    line.quantity(), line.unitPrice(), line.amount()));
        }
        return new PreSettleRequest(psnNo, insutype, input.settlementId(), input.settlementNo(), input.grossAmount(),
                input.organizationCode(), input.departmentCode(), input.practitionerCode(), items,
                mdtrtId, credential.certType(), credential.certNo());
    }

    private String registerVisit(InsuranceInstruction input, String psnNo, String insutype, Credential credential,
                                 String operator, String insuplc, String time) {
        ObjectNode registration = JsonNodeFactory.instance.objectNode();
        var data = registration.putObject("data");
        data.put("psn_no", psnNo); data.put("insutype", insutype); data.put("begntime", time);
        data.put("mdtrt_cert_type", credential.certType()); data.put("mdtrt_cert_no", credential.certNo());
        data.put("ipt_otp_no", input.settlementNo());
        data.put("atddr_no", operator); data.put("dr_name", operator);
        data.put("dept_code", input.departmentCode()); data.put("dept_name", input.departmentCode());
        data.put("caty", input.departmentCode());
        JsonNode registered = call("2201", operator, insuplc, registration);
        return required(text(first(registered, "data", "result").path("mdtrt_id")), "2201 未返回就诊 ID");
    }

    private void uploadVisit(InsuranceInstruction input, com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceDiagnosis primary, String mdtrtId, String psnNo,
                             String operator, String insuplc, String time) {
        ObjectNode visit = JsonNodeFactory.instance.objectNode();
        var info = visit.putObject("mdtrtinfo");
        info.put("mdtrt_id", mdtrtId); info.put("psn_no", psnNo); info.put("med_type", properties.medType());
        info.put("begntime", time); info.put("main_cond_dscr", primary.name());
        info.put("dise_codg", primary.code()); info.put("dise_name", primary.name());
        var diseases = visit.putArray("diseinfo");
        for (var diagnosis : input.diagnoses()) {
            var row = diseases.addObject();
            row.put("diag_type", "PRIMARY".equals(diagnosis.diagnosisTypeCode()) ? "1" : "2");
            row.put("diag_srt_no", diagnosis.sortNo());
            row.put("diag_code", diagnosis.code()); row.put("diag_name", diagnosis.name());
            row.put("diag_dept", input.departmentCode()); row.put("dise_dor_no", operator); row.put("dise_dor_name", operator);
            row.put("diag_time", time);
        }
        call("2203A", operator, insuplc, visit);
    }

    @Override
    public SettleRequest prepareSettle(InsuranceInstruction input, String preSettlementNo) {
        return new SettleRequest(preSettlementNo, requirePersonNo(input.externalPersonNo()), input.settlementNo(),
                requireOperator(input.practitionerCode()), requireInsutype(input.insuranceTypeCode()));
    }

    @Override
    public ReversalRequest prepareReversal(InsuranceReversal input) {
        return new ReversalRequest(input.originalExternalSettlementNo(), requirePersonNo(input.externalPersonNo()),
                requireOperator(input.practitionerCode()), input.reason(), input.registrationScene(), input.settlementNo());
    }

    @Override
    public PreSettlementCancelRequest preparePreSettlementCancel(
            com.rhn.billing.api.InsuranceSettlementAdapter.InsurancePreSettlementCancellation input) {
        return new PreSettlementCancelRequest(required(input.externalPreSettlementNo(), "缺少原预结算流水"),
                requirePersonNo(input.externalPersonNo()), requireOperator(input.practitionerCode()),
                required(input.settlementNo(), "缺少收费批次号"), requireInsutype(input.insuranceTypeCode()),
                input.visitRegisteredByClaim());
    }

    // ==================== 1101 / 2206 / 2207 / 2208 ====================

    @Override
    public void forgetCredential(String personNo) {
        if (personNo != null) credentials.remove(personNo.trim());
    }

    @Override
    public PersonInfoResponse queryPersonInfo(PersonInfoRequest request) {
        String certNo = required(request.certno(), "证件号码或电子凭证 token 不能为空");
        String certType = switch (String.valueOf(request.psnCertType())) {
            case "01" -> "02";   // 本系统 01 居民身份证 -> 平台 02
            case "02" -> "01";   // 本系统 02 医保电子凭证 -> 平台 01
            case "06" -> "03";   // 本系统 06 社保卡 -> 平台 03
            default -> throw BusinessErrors.badRequest("CHS_CERT_TYPE_UNSUPPORTED", "不支持的医保就诊凭证类型");
        };
        ObjectNode body = JsonNodeFactory.instance.objectNode();
        var data = body.putObject("data");
        data.put("mdtrt_cert_type", certType); data.put("mdtrt_cert_no", certNo); data.put("card_sn", "");
        data.put("begntime", TIME.format(LocalDateTime.ofInstant(clock.instant(), zone)));
        data.put("psn_cert_type", "02".equals(certType) ? "01" : "");
        data.put("certno", "02".equals(certType) ? certNo : "");
        data.put("psn_name", request.psnName() == null ? "" : request.psnName());
        JsonNode output = call("1101", properties.defaultOperator(), "", body);
        JsonNode base = output.path("baseinfo");
        String psnNo = required(text(base.path("psn_no")), "1101 未返回医保人员编号");
        JsonNode insuInfo = pickInsurance(output.path("insuinfo"));
        String insutype = required(text(insuInfo.path("insutype")), "1101 未返回险种类型");

        Map<String, String> regions = new HashMap<>();
        for (JsonNode row : output.path("insuinfo")) {
            String type = text(row.path("insutype")), region = text(row.path("insuplc_admdvs"));
            if (type != null && region != null) regions.putIfAbsent(type, region);
        }
        credentials.put(psnNo, new Credential(certType, certNo, Map.copyOf(regions), clock.instant().plus(properties.credentialTtl())));
        String stas = text(insuInfo.path("psn_insu_stas"));
        return new PersonInfoResponse(psnNo, request.psnCertType(), text(base.path("certno")), text(base.path("psn_name")),
                text(base.path("gend")), date(text(base.path("brdy"))), insutype, insutypeName(insutype),
                optionalMoney(insuInfo.path("balc")), text(insuInfo.path("insuplc_admdvs")), null,
                text(insuInfo.path("psn_type")), "1".equals(stas) ? "NORMAL" : "2".equals(stas) ? "SUSPENDED"
                : "3".equals(stas) ? "TERMINATED" : stas);
    }

    @Override
    public PreSettleResponse preSettle(PreSettleRequest request) {
        String operator = requireOperator(request.practitionerCode());
        ObjectNode body = JsonNodeFactory.instance.objectNode();
        var data = body.putObject("data");
        data.put("mdtrt_id", required(request.mdtrtId(), "缺少就诊 ID"));
        data.put("psn_no", request.psnNo()); data.put("insutype", request.insutype());
        data.put("mdtrt_cert_type", request.mdtrtCertType()); data.put("mdtrt_cert_no", request.mdtrtCertNo());
        data.put("med_type", properties.medType()); data.put("medfee_sumamt", request.medfeeSumamt());
        data.put("psn_setlway", "01"); data.put("chrg_bchno", request.settlementNo());
        data.put("acct_used_flag", properties.accountUsed() ? "1" : "0");
        JsonNode output = call("2206", operator, region(request.psnNo(), request.insutype()), body);
        JsonNode info = output.path("setlinfo");
        Allocation a = allocation(info);
        String setlId = required(text(info.path("setl_id")), "2206 未返回结算 ID");
        return new PreSettleResponse(request.mdtrtId() + REF_SEPARATOR + setlId, a.total(), money(info, "inscp_scp_amt"),
                a.pool(), a.major(), a.other(), a.account(), a.cash(), money(info, "fulamt_ownpay_amt"),
                money(info, "preselfpay_amt"), "CNY", "医保预结算完成");
    }

    @Override
    public SettleResponse settle(SettleRequest request) {
        String mdtrtId = mdtrtOf(request.preSetlId());
        ObjectNode body = JsonNodeFactory.instance.objectNode();
        var data = body.putObject("data");
        data.put("mdtrt_id", mdtrtId); data.put("psn_no", request.psnNo());
        data.put("insutype", required(request.insutype(), "缺少险种类型"));
        data.put("chrg_bchno", request.settlementNo());
        data.put("acct_used_flag", properties.accountUsed() ? "1" : "0");
        JsonNode output = call("2207", request.operatorId(), region(request.psnNo(), request.insutype()), body);
        JsonNode info = output.path("setlinfo");
        Allocation a = allocation(info);
        String setlId = required(text(info.path("setl_id")), "2207 未返回结算 ID");
        String time = required(text(info.path("setl_time")), "2207 未返回结算时间");
        Instant settledAt = LocalDateTime.parse(time, TIME).atZone(zone).toInstant();
        return new SettleResponse(mdtrtId + REF_SEPARATOR + setlId, request.preSetlId(), a.total(), a.pool(), a.major(),
                a.other(), a.account(), a.cash(), settledAt, "医保结算完成");
    }

    @Override
    public ReversalResponse reverse(ReversalRequest request) {
        String mdtrtId = mdtrtOf(request.setlId());
        String setlId = request.setlId().substring(request.setlId().indexOf(REF_SEPARATOR) + 1);
        ObjectNode body = JsonNodeFactory.instance.objectNode();
        var data = body.putObject("data");
        data.put("setl_id", setlId); data.put("mdtrt_id", mdtrtId); data.put("psn_no", request.psnNo());
        try {
            JsonNode output = call("2208", request.operatorId(), region(request.psnNo(), null), body);
            String reversalId = text(first(output, "setlinfo", "data", "result").path("setl_id"));
            String message = "医保结算已撤销";
            if (request.registrationCancel()) message += cancelRegistration(request, mdtrtId);
            return new ReversalResponse(reversalId == null ? setlId : reversalId, request.setlId(),
                    clock.instant(), true, message);
        } catch (ChsRejectedException rejected) {
            return new ReversalResponse(null, request.setlId(), clock.instant(), false, rejected.getMessage());
        }
    }

    /**
     * 2205 撤销预结算前按收费批次上传的费用明细；本申请登记的就诊再以 2202 撤销。2205 被拒则整体失败，
     * 2202 失败时费用明细已撤销，只提示人工在医保平台核对就诊登记。
     */
    @Override
    public String cancelPreSettlement(PreSettlementCancelRequest request) {
        String mdtrtId = mdtrtOf(request.preSetlId());
        String insuplc = region(request.psnNo(), request.insutype());
        ObjectNode body = JsonNodeFactory.instance.objectNode();
        var data = body.putObject("data");
        data.put("mdtrt_id", mdtrtId); data.put("chrg_bchno", request.settlementNo()); data.put("psn_no", request.psnNo());
        call("2205", request.operatorId(), insuplc, body);
        if (!request.registrationCancel()) return "医保费用明细已撤销";
        ObjectNode registration = JsonNodeFactory.instance.objectNode();
        var visit = registration.putObject("data");
        visit.put("mdtrt_id", mdtrtId); visit.put("psn_no", request.psnNo()); visit.put("ipt_otp_no", request.settlementNo());
        try {
            call("2202", request.operatorId(), insuplc, registration);
            return "医保费用明细与就诊登记已撤销";
        } catch (RuntimeException failure) {
            return "医保费用明细已撤销，但就诊登记撤销(2202)未成功，请人工核对医保平台：" + failure.getMessage();
        }
    }

    /**
     * 2202 挂号撤销：结算撤销成功后撤销挂号登记。资金已冲正，此步失败不回滚结算撤销，
     * 只在回执说明中提示需人工在医保平台核对撤销挂号。
     */
    private String cancelRegistration(ReversalRequest request, String mdtrtId) {
        ObjectNode body = JsonNodeFactory.instance.objectNode();
        var data = body.putObject("data");
        data.put("mdtrt_id", mdtrtId); data.put("psn_no", request.psnNo());
        data.put("ipt_otp_no", request.visitNo() == null ? "" : request.visitNo());
        try {
            call("2202", request.operatorId(), region(request.psnNo(), null), body);
            return "，挂号登记已撤销";
        } catch (RuntimeException failure) {
            return "，但挂号登记撤销(2202)未成功，请人工核对医保平台：" + failure.getMessage();
        }
    }

    // ==================== 传输与报文外壳 ====================

    private JsonNode call(String infno, String operator, String insuplcAdmdvs, ObjectNode input) {
        return call(infno, operator, insuplcAdmdvs, input, false);
    }

    /** 签到流水失效时平台在处理业务前即拒绝，重新签到后可安全重发一次（新 msgid）。 */
    private JsonNode call(String infno, String operator, String insuplcAdmdvs, ObjectNode input, boolean resigned) {
        String opter = operator == null || operator.isBlank() ? properties.defaultOperator() : operator;
        String signNo = properties.signInRequired() && !"9001".equals(infno) ? signNo(opter) : "";
        String request = json.write(envelope(infno, opter, insuplcAdmdvs, signNo, input));
        Instant started = clock.instant();
        long begin = System.nanoTime();
        Posted posted;
        try {
            posted = post(request, infno);
        } catch (ChsTransportException failure) {
            emit(infno, started, begin, failure.httpStatus(), null, null, failure.kind(), request, failure.body());
            throw failure;
        }
        JsonNode response = posted.tree();
        String code = text(response.path("infcode"));
        if (!"0".equals(code)) {
            signNos.remove(opter);
            emit(infno, started, begin, posted.status(), code, message(response), ChsExchange.Outcome.REJECTED, request, posted.body());
            if (!resigned && properties.signInRequired() && !"9001".equals(infno)
                    && message(response).contains("签到")) {
                return call(infno, operator, insuplcAdmdvs, input, true);
            }
            throw new ChsRejectedException(code == null ? "UNKNOWN" : code, message(response));
        }
        JsonNode output = response.path("output");
        if (output.isMissingNode() || output.isNull()) {
            emit(infno, started, begin, posted.status(), code, null, ChsExchange.Outcome.INCOMPLETE, request, posted.body());
            throw new IllegalStateException(infno + " 回执缺少 output");
        }
        emit(infno, started, begin, posted.status(), code, text(response.path("err_msg")), ChsExchange.Outcome.OK, request, posted.body());
        return output;
    }

    private void emit(String infno, Instant started, long begin, Integer status, String infcode, String errMsg,
                      ChsExchange.Outcome outcome, String request, String response) {
        var consumer = observer.get();
        if (consumer == null) return;
        consumer.accept(new ChsExchange(infno, started, (System.nanoTime() - begin) / 1_000_000, status, infcode, errMsg,
                outcome, request, response));
    }

    /** 在当前线程内观察本客户端发出的每次网关往返（联通探测使用）；观察者只在 {@code action} 执行期间有效。 */
    public <T> T observe(Consumer<ChsExchange> consumer, Supplier<T> action) {
        var previous = observer.get();
        observer.set(consumer);
        try { return action.get(); }
        finally { if (previous == null) observer.remove(); else observer.set(previous); }
    }

    /** 是否配置为需要 9001 签到。 */
    public boolean signInRequired() { return properties.signInRequired(); }

    /** 丢弃默认经办人的缓存签到并重新签到，用于验证网关连通与签到登记资料。 */
    public void forceSignIn() {
        if (!properties.signInRequired()) throw BusinessErrors.conflict("CHS_SIGN_IN_NOT_REQUIRED", "当前配置无需签到");
        signNos.remove(properties.defaultOperator());
        signNo(properties.defaultOperator());
    }

    private String signNo(String operator) {
        String cached = signNos.get(operator);
        if (cached != null) return cached;
        ObjectNode body = JsonNodeFactory.instance.objectNode();
        var sign = body.putObject("signIn");
        sign.put("opter_no", operator); sign.put("mac", properties.signInMac()); sign.put("ip", properties.signInIp());
        JsonNode output = call("9001", operator, "", body);
        String value = required(text(output.path("signinoutb").path("sign_no")), "9001 未返回签到流水号");
        signNos.put(operator, value);
        return value;
    }

    private ObjectNode envelope(String infno, String operator, String insuplcAdmdvs, String signNo, ObjectNode input) {
        var now = LocalDateTime.ofInstant(clock.instant(), zone);
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        root.put("infno", infno);
        root.put("msgid", properties.fixmedinsCode() + STAMP.format(now) + String.format("%04d", Math.floorMod(sequence.incrementAndGet(), 10000)));
        root.put("mdtrtarea_admvs", properties.mdtrtareaAdmvs());
        root.put("insuplc_admdvs", insuplcAdmdvs == null ? "" : insuplcAdmdvs);
        root.put("recer_sys_code", properties.recerSysCode());
        root.put("dev_no", nullToEmpty(properties.devNo())); root.put("dev_safe_info", nullToEmpty(properties.devSafeInfo()));
        root.put("cainfo", nullToEmpty(properties.cainfo())); root.put("signtype", nullToEmpty(properties.signtype()));
        root.put("infver", properties.infver());
        root.put("opter_type", properties.opterType()); root.put("opter", operator); root.put("opter_name", operator);
        root.put("inf_time", TIME.format(now));
        root.put("fixmedins_code", properties.fixmedinsCode()); root.put("fixmedins_name", properties.fixmedinsName());
        root.put("sign_no", signNo);
        root.set("input", input);
        return root;
    }

    private record Posted(int status, String body, JsonNode tree) {}

    private Posted post(String request, String infno) {
        Transport.Response response;
        try {
            response = transport.post(endpoint, properties.headers(), request);
        } catch (java.net.http.HttpTimeoutException exception) {
            throw new ChsTransportException(ChsExchange.Outcome.TIMEOUT, null, null, infno + " 调用医保网关超时，交易结果未知", exception);
        } catch (IOException exception) {
            throw new ChsTransportException(ChsExchange.Outcome.NETWORK, null, null, infno + " 调用医保网关失败，交易结果未知", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ChsTransportException(ChsExchange.Outcome.NETWORK, null, null, infno + " 调用医保网关被中断，交易结果未知", exception);
        }
        if (response.status() < 200 || response.status() >= 300) {
            throw new ChsTransportException(ChsExchange.Outcome.HTTP_STATUS, response.status(), response.body(),
                    infno + " 医保网关返回 HTTP " + response.status() + "，交易结果未知", null);
        }
        try {
            return new Posted(response.status(), response.body(), json.readTree(response.body()));
        } catch (RuntimeException exception) {
            throw new ChsTransportException(ChsExchange.Outcome.BAD_JSON, response.status(), response.body(),
                    infno + " 医保网关回执不是有效 JSON，交易结果未知", exception);
        }
    }

    // ==================== 回执解析：缺失金额不当作零 ====================

    private record Allocation(BigDecimal total, BigDecimal pool, BigDecimal major, BigDecimal other, BigDecimal account, BigDecimal cash) {}

    /** 基金支付总额扣除统筹与大病后归入“其他基金”；共济账户并入个人账户支出。 */
    private Allocation allocation(JsonNode info) {
        BigDecimal total = money(info, "medfee_sumamt"), fund = money(info, "fund_pay_sumamt");
        BigDecimal pool = money(info, "hifp_pay"), major = money(info, "hifob_pay");
        BigDecimal other = fund.subtract(pool).subtract(major);
        if (other.signum() < 0) throw new IllegalStateException("医保基金支付明细超过基金支付总额");
        // 共济账户支付并非所有统筹区返回，缺省按未发生处理；合计不平会被适配器的资金守恒校验拒绝。
        BigDecimal mutual = info.path("acct_mulaid_pay").isMissingNode() || info.path("acct_mulaid_pay").isNull()
                ? BigDecimal.ZERO : money(info, "acct_mulaid_pay");
        return new Allocation(total, pool, major, other, money(info, "acct_pay").add(mutual), money(info, "psn_cash_pay"));
    }

    private static BigDecimal money(JsonNode node, String field) {
        String value = text(node.path(field));
        if (value == null) throw new IllegalStateException("医保回执缺少金额 " + field);
        try { return new BigDecimal(value); }
        catch (NumberFormatException exception) { throw new IllegalStateException("医保回执金额 " + field + " 不是数字", exception); }
    }

    private static BigDecimal optionalMoney(JsonNode node) {
        String value = text(node);
        try { return value == null ? null : new BigDecimal(value); }
        catch (NumberFormatException exception) { return null; }
    }

    private JsonNode pickInsurance(JsonNode insuInfo) {
        if (!insuInfo.isArray() || insuInfo.isEmpty()) throw new IllegalStateException("1101 未返回参保信息");
        for (JsonNode row : insuInfo) if ("1".equals(text(row.path("psn_insu_stas")))) return row;
        return insuInfo.get(0);
    }

    // ==================== 小工具 ====================

    private static String insutypeName(String code) {
        return switch (code) {
            case "310" -> "职工基本医疗保险";
            case "390" -> "城乡居民基本医疗保险";
            case "320" -> "公务员医疗补助";
            case "330" -> "大额医疗费用补助";
            case "340" -> "离休人员医疗保障";
            case "350" -> "一至六级残废军人医疗补助";
            case "360" -> "老红军医疗保障";
            case "370" -> "企业补充医疗保险";
            default -> code;
        };
    }

    private static String listCategory(String medListCode) {
        // 仅用于本地分类校验，不随报文发出：药品目录 X/Z/T/M，医用耗材 C，其余按诊疗服务。
        char head = medListCode == null || medListCode.isEmpty() ? ' ' : Character.toUpperCase(medListCode.charAt(0));
        return head == 'X' || head == 'Z' || head == 'T' || head == 'M' ? "1" : head == 'C' ? "3" : "2";
    }

    private static String itemLevel(String platformLevel) {
        return switch (String.valueOf(platformLevel)) {
            case "01", "1" -> "1";
            case "02", "2" -> "2";
            case "03", "3" -> "3";
            default -> throw new IllegalStateException("2204 返回了未知的收费项目等级：" + platformLevel);
        };
    }

    private String region(String psnNo, String insutype) {
        Credential credential = credentials.get(psnNo);
        if (credential == null || credential.expiresAt().isBefore(clock.instant())) return "";
        if (insutype != null) return credential.insuplcByInsutype().getOrDefault(insutype, "");
        return credential.insuplcByInsutype().values().stream().findFirst().orElse("");
    }

    private Credential requireCredential(String psnNo, String insutype) {
        Credential credential = credentials.get(psnNo);
        if (credential == null || credential.expiresAt().isBefore(clock.instant())) {
            credentials.remove(psnNo);
            throw BusinessErrors.conflict("CHS_REQUEST_CONTEXT_UNCONFIRMED", "参保人鉴权凭证已失效，请重新读取电子凭证或证件后再办理医保结算");
        }
        if (!credential.insuplcByInsutype().containsKey(insutype)) {
            throw BusinessErrors.conflict("CHS_REQUEST_CONTEXT_UNCONFIRMED", "医保鉴权结果中没有该险种的参保记录");
        }
        return credential;
    }

    private static String requirePersonNo(String value) {
        if (value == null || value.isBlank()) {
            throw BusinessErrors.conflict("CHS_REQUEST_CONTEXT_UNCONFIRMED", "患者保障信息未登记医保个人编号，请先在保障信息中核实");
        }
        return value.trim();
    }

    private static String requireInsutype(String value) {
        if (value == null || !INSUTYPE.matcher(value.trim()).matches()) {
            throw BusinessErrors.conflict("CHS_REQUEST_CONTEXT_UNCONFIRMED", "正式医保网关要求三位险种类型编码（如 310、390）");
        }
        return value.trim();
    }

    private static String requireOperator(String value) {
        if (value == null || value.isBlank()) throw BusinessErrors.conflict("CHS_REQUEST_CONTEXT_UNCONFIRMED", "医保经办人编号未确认");
        return value.trim();
    }

    private static String mdtrtOf(String reference) {
        int at = reference == null ? -1 : reference.indexOf(REF_SEPARATOR);
        if (at <= 0 || at == reference.length() - 1) throw new IllegalStateException("外部医保流水格式无效，缺少就诊 ID");
        return reference.substring(0, at);
    }

    private static JsonNode first(JsonNode node, String... names) {
        for (String name : names) if (!node.path(name).isMissingNode() && !node.path(name).isNull()) return node.path(name);
        throw new IllegalStateException("医保回执缺少 " + String.join("/", names));
    }

    private static String message(JsonNode response) {
        String message = text(response.path("err_msg"));
        return message == null ? "医保平台拒绝了该交易（infcode=" + text(response.path("infcode")) + "）" : message;
    }

    private static String text(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        String value = node.asString();
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static LocalDate date(String value) {
        try { return value == null ? null : LocalDate.parse(value.length() > 10 ? value.substring(0, 10) : value); }
        catch (RuntimeException exception) { return null; }
    }

    private static String required(String value, String message) {
        if (value == null || value.isBlank()) throw new IllegalStateException(message);
        return value;
    }

    private static String nullToEmpty(String value) { return value == null ? "" : value; }
}
