package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.shared.json.JsonCodec;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 进程内医保网关桩，按 docs/billing/医保Mock服务接口要求.md 第 2～4 节的外部行为实现，仅用于测试，
 * 让探测与客户端走真实 HTTP（地址、请求头、超时、编码、sign_no 流程）。金额比例不代表真实政策。
 */
public final class ChsGatewayStub implements AutoCloseable {
    public static final String TOKEN = "stub-token";

    private final JsonMapper mapper = JsonMapper.builder().build();
    private final HttpServer server;
    private final Set<String> msgIds = new HashSet<>();
    private final Map<String, String> signNos = new HashMap<>();
    private final Map<String, Person> persons = new HashMap<>();   // psn_no -> person
    private final Map<String, Visit> visits = new HashMap<>();     // mdtrt_id -> visit
    private final Map<String, Settlement> settlements = new HashMap<>();
    private final AtomicInteger sequence = new AtomicInteger(100);
    private final List<JsonNode> requests = Collections.synchronizedList(new ArrayList<>());
    private volatile boolean requireToken = true;
    private volatile long slowMillis = 3_000;

    private record Person(String psnNo, String certNo, String scenario, String insutype) {}

    private static final class Visit {
        final Person person; boolean diagnosed; JsonNode fees; Settlement pre; boolean settled;
        Visit(Person person) { this.person = person; }
    }

    private static final class Settlement {
        final String id; final String mdtrtId; final ObjectNode info; boolean reversed; boolean formal;
        Settlement(String id, String mdtrtId, ObjectNode info) { this.id = id; this.mdtrtId = mdtrtId; this.info = info; }
    }

    public ChsGatewayStub() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException exception) { throw new IllegalStateException(exception); }
        server.createContext("/hsa/api", this::handle);
        server.start();
    }

    public String url() { return "http://127.0.0.1:" + server.getAddress().getPort() + "/hsa/api"; }
    public List<JsonNode> requests() { return List.copyOf(requests); }
    public void requireToken(boolean value) { requireToken = value; }
    public void slowMillis(long value) { slowMillis = value; }
    @Override public void close() { server.stop(0); }

    public static JsonCodec codec() {
        JsonMapper mapper = JsonMapper.builder().build();
        return new JsonCodec() {
            @Override public String write(Object value) { return mapper.writeValueAsString(value); }
            @Override public JsonNode readTree(String value) { return mapper.readTree(value); }
            @Override public <T> T read(String value, Class<T> type) { return mapper.readValue(value, type); }
            @Override @SuppressWarnings("unchecked")
            public Map<String, Object> readObject(String value) { return mapper.readValue(value, LinkedHashMap.class); }
        };
    }

    // ==================== 协议处理 ====================

    private void handle(HttpExchange exchange) throws IOException {
        byte[] raw = exchange.getRequestBody().readAllBytes();
        String body = new String(raw, StandardCharsets.UTF_8);
        if (requireToken && !TOKEN.equals(exchange.getRequestHeaders().getFirst("X-Token"))) { send(exchange, 401, "unauthorized"); return; }
        JsonNode request;
        try { request = mapper.readTree(body); } catch (RuntimeException exception) { send(exchange, 400, "bad"); return; }
        requests.add(request);
        String reply;
        int status = 200;
        synchronized (this) {
            try {
                Result result = process(request);
                reply = result.body; status = result.status;
            } catch (Rejection rejection) {
                reply = fail(request, rejection.getMessage());
            }
        }
        if (reply.equals("SLOW")) {
            try { Thread.sleep(slowMillis); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            reply = fail(request, "slow");
        }
        send(exchange, status, reply);
    }

    private record Result(int status, String body) {}

    private static final class Rejection extends RuntimeException {
        Rejection(String message) { super(message); }
    }

    private Result process(JsonNode request) {
        for (String field : List.of("infno", "msgid", "mdtrtarea_admvs", "insuplc_admdvs", "recer_sys_code", "dev_no", "dev_safe_info",
                "cainfo", "signtype", "infver", "opter_type", "opter", "opter_name", "inf_time", "fixmedins_code", "fixmedins_name", "sign_no", "input")) {
            if (request.path(field).isMissingNode()) throw new Rejection("缺少外壳字段 " + field);
        }
        if (!msgIds.add(request.path("msgid").asString())) throw new Rejection("msgid 重复");
        if (!request.path("inf_time").asString().matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}")) throw new Rejection("inf_time 格式错误");
        String infno = request.path("infno").asString();
        String opter = request.path("opter").asString();
        JsonNode input = request.path("input");
        if (!"9001".equals(infno) && !request.path("sign_no").asString().equals(signNos.get(opter))) throw new Rejection("签到无效或已失效，请重新签到");
        ObjectNode output = JsonNodeFactory.instance.objectNode();
        Person scenarioPerson = null;
        switch (infno) {
            case "9001" -> {
                JsonNode sign = input.path("signIn");
                if (sign.path("opter_no").asString().isBlank() || sign.path("mac").asString().isBlank()) throw new Rejection("签到参数不全");
                if (!opter.equals(sign.path("opter_no").asString())) throw new Rejection("签到经办人与登记资料不一致");
                String signNo = "SIGN" + sequence.incrementAndGet();
                signNos.put(opter, signNo);
                output.putObject("signinoutb").put("sign_no", signNo).put("sign_time", "2026-10-18 10:00:00");
            }
            case "1101" -> person(input.path("data"), output);
            case "2201" -> register(input.path("data"), output);
            case "2203A" -> {
                Visit visit = visit(input.path("mdtrtinfo").path("mdtrt_id").asString());
                JsonNode dis = input.path("diseinfo");
                if (!dis.isArray() || dis.isEmpty() || input.path("mdtrtinfo").path("dise_codg").asString().isBlank()) throw new Rejection("缺少主诊断");
                visit.diagnosed = true;
            }
            case "2204" -> fees(input, output);
            case "2206" -> {
                Result special = settle(input.path("data"), output, false);
                if (special != null) return special;
            }
            case "2207" -> {
                Result special = settle(input.path("data"), output, true);
                if (special != null) return special;
            }
            case "2208" -> reverse(input.path("data"), output);
            default -> throw new Rejection("不支持的交易 " + infno);
        }
        if (scenarioPerson == null && !"9001".equals(infno) && "TEST-SIGN-EXPIRE".equals(scenarioOf(input))) signNos.remove(opter);
        return new Result(200, ok(request, output));
    }

    private String scenarioOf(JsonNode input) {
        JsonNode data = input.path("data");
        String psn = data.path("psn_no").asString(null);
        if (psn == null) psn = input.path("mdtrtinfo").path("psn_no").asString(null);
        if (psn == null) psn = input.path("feedetail").path(0).path("psn_no").asString(null);
        Person person = psn == null ? null : persons.get(psn);
        return person == null ? "" : person.scenario();
    }

    private void person(JsonNode data, ObjectNode output) {
        String cert = data.path("mdtrt_cert_no").asString();
        String psnNo = "3601" + String.format("%06d", Math.abs(cert.hashCode()) % 1_000_000);
        switch (cert) {
            case "TEST-310", "TEST-SIGN-EXPIRE", "TEST-REJECT-2206", "TEST-IMBALANCE", "TEST-MISSING-AMT", "TEST-SLOW", "TEST-HTTP500", "TEST-BADJSON" -> {
                persons.put(psnNo, new Person(psnNo, cert, cert, "310"));
                base(output, psnNo).putArray("insuinfo").addObject().put("insutype", "310").put("psn_insu_stas", "1")
                        .put("balc", "1850.00").put("psn_type", "11").put("insuplc_admdvs", "360100");
            }
            case "TEST-390" -> {
                persons.put(psnNo, new Person(psnNo, cert, cert, "390"));
                base(output, psnNo).putArray("insuinfo").addObject().put("insutype", "390").put("psn_insu_stas", "1")
                        .put("balc", "0.00").put("psn_type", "21").put("insuplc_admdvs", "360100");
            }
            case "TEST-MULTI" -> {
                persons.put(psnNo, new Person(psnNo, cert, cert, "310"));
                var rows = base(output, psnNo).putArray("insuinfo");
                rows.addObject().put("insutype", "390").put("psn_insu_stas", "3").put("insuplc_admdvs", "360200");
                rows.addObject().put("insutype", "310").put("psn_insu_stas", "1").put("balc", "100.00").put("insuplc_admdvs", "360100");
            }
            case "TEST-SUSPENDED" -> {
                persons.put(psnNo, new Person(psnNo, cert, cert, "310"));
                base(output, psnNo).putArray("insuinfo").addObject().put("insutype", "310").put("psn_insu_stas", "2").put("insuplc_admdvs", "360100");
            }
            default -> throw new Rejection("未找到参保人员");
        }
    }

    private static ObjectNode base(ObjectNode output, String psnNo) {
        output.putObject("baseinfo").put("psn_no", psnNo).put("certno", "360102198801011234").put("psn_name", "测试人员")
                .put("gend", "1").put("brdy", "1988-01-01");
        return output;
    }

    private void register(JsonNode data, ObjectNode output) {
        Person person = persons.get(data.path("psn_no").asString());
        if (person == null) throw new Rejection("人员未通过 1101 鉴权");
        if (!person.certNo().equals(data.path("mdtrt_cert_no").asString())) throw new Rejection("就诊凭证与鉴权不一致");
        String mdtrtId = "MDT" + sequence.incrementAndGet();
        visits.put(mdtrtId, new Visit(person));
        output.putObject("data").put("mdtrt_id", mdtrtId);
    }

    private Visit visit(String mdtrtId) {
        Visit visit = visits.get(mdtrtId);
        if (visit == null) throw new Rejection("就诊 ID 不存在");
        return visit;
    }

    private void fees(JsonNode input, ObjectNode output) {
        JsonNode rows = input.path("feedetail");
        if (!rows.isArray() || rows.isEmpty()) throw new Rejection("缺少费用明细");
        Visit visit = visit(rows.get(0).path("mdtrt_id").asString());
        if (!visit.diagnosed) throw new Rejection("请先上传就诊诊断(2203A)");
        var result = output.putArray("result");
        for (JsonNode row : rows) {
            BigDecimal cnt = new BigDecimal(row.path("cnt").asString()), pric = new BigDecimal(row.path("pric").asString());
            if (cnt.multiply(pric).compareTo(new BigDecimal(row.path("det_item_fee_sumamt").asString())) != 0) throw new Rejection("费用金额不等于数量乘单价");
            String code = row.path("med_list_codg").asString();
            result.addObject().put("feedetl_sn", row.path("feedetl_sn").asString())
                    .put("chrgitm_lv", code.startsWith("XA") ? "01" : code.startsWith("XB") ? "02" : "03");
        }
        visit.fees = rows;
    }

    private Result settle(JsonNode data, ObjectNode output, boolean formal) {
        Visit visit = visit(data.path("mdtrt_id").asString());
        String scenario = visit.person.scenario();
        if (visit.fees == null) throw new Rejection("请先上传费用明细(2204)");
        if (formal) {
            if (visit.pre == null) throw new Rejection("请先预结算(2206)");
            if (visit.settled) throw new Rejection("该就诊已结算");
            if ("TEST-HTTP500".equals(scenario)) return new Result(500, "boom");
            if ("TEST-BADJSON".equals(scenario)) return new Result(200, "<html>login</html>");
        } else {
            if ("TEST-REJECT-2206".equals(scenario)) throw new Rejection("存在未结算记录");
            if ("TEST-SLOW".equals(scenario)) return new Result(200, "SLOW");
        }
        BigDecimal total = BigDecimal.ZERO, fund = BigDecimal.ZERO, own = BigDecimal.ZERO, preSelf = BigDecimal.ZERO, scope = BigDecimal.ZERO;
        for (JsonNode row : visit.fees) {
            BigDecimal amount = new BigDecimal(row.path("det_item_fee_sumamt").asString());
            String code = row.path("med_list_codg").asString();
            total = total.add(amount);
            if (code.startsWith("XA")) { fund = fund.add(amount.multiply(new BigDecimal("0.80"))); scope = scope.add(amount); }
            else if (code.startsWith("XB")) {
                BigDecimal self = amount.multiply(new BigDecimal("0.15")), eligible = amount.subtract(self);
                preSelf = preSelf.add(self); scope = scope.add(eligible); fund = fund.add(eligible.multiply(new BigDecimal("0.70")));
            } else own = own.add(amount);
        }
        fund = fund.setScale(2, RoundingMode.HALF_UP); total = total.setScale(2, RoundingMode.HALF_UP);
        BigDecimal remaining = total.subtract(fund);
        BigDecimal acct = "310".equals(visit.person.insutype()) && "1".equals(data.path("acct_used_flag").asString())
                ? remaining.min(new BigDecimal("1850.00")) : BigDecimal.ZERO;
        BigDecimal cash = remaining.subtract(acct);
        if ("TEST-IMBALANCE".equals(scenario)) cash = cash.add(new BigDecimal("1.00"));
        ObjectNode info = JsonNodeFactory.instance.objectNode();
        String setlId = (formal ? "SETL" : "PRE") + sequence.incrementAndGet();
        info.put("setl_id", setlId).put("medfee_sumamt", money(total)).put("fund_pay_sumamt", money(fund)).put("hifp_pay", money(fund))
                .put("hifob_pay", "0.00").put("psn_cash_pay", money(cash)).put("inscp_scp_amt", money(scope))
                .put("fulamt_ownpay_amt", money(own)).put("preselfpay_amt", money(preSelf));
        if (!"TEST-MISSING-AMT".equals(scenario)) info.put("acct_pay", money(acct));
        Settlement settlement = new Settlement(setlId, visit.person.psnNo(), info);
        if (formal) { info.put("setl_time", "2026-10-18 10:05:00"); settlement.formal = true; visit.settled = true; settlements.put(setlId, settlement); }
        else visit.pre = settlement;
        output.set("setlinfo", info);
        return null;
    }

    private void reverse(JsonNode data, ObjectNode output) {
        Settlement settlement = settlements.get(data.path("setl_id").asString());
        if (settlement == null || !settlement.formal) throw new Rejection("原结算不存在");
        if (settlement.reversed) throw new Rejection("原结算已撤销");
        settlement.reversed = true;
        output.putObject("setlinfo").put("setl_id", "REV" + sequence.incrementAndGet());
    }

    private static String money(BigDecimal value) { return value.setScale(2, RoundingMode.HALF_UP).toPlainString(); }

    private String ok(JsonNode request, ObjectNode output) {
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        root.put("infcode", 0).put("inf_refmsgid", request.path("msgid").asString()).put("err_msg", "");
        root.set("output", output);
        return mapper.writeValueAsString(root);
    }

    private String fail(JsonNode request, String message) {
        return mapper.writeValueAsString(JsonNodeFactory.instance.objectNode().put("infcode", -1)
                .put("inf_refmsgid", request.path("msgid").asString()).put("err_msg", message));
    }

    private static void send(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json;charset=UTF-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (var out = exchange.getResponseBody()) { out.write(bytes); }
    }
}
