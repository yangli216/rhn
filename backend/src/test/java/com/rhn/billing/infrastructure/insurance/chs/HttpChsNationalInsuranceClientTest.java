package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.api.InsuranceSettlementAdapter.*;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HttpChsNationalInsuranceClientTest {
    static final Instant NOW = Instant.parse("2026-10-18T02:00:00Z");
    final JsonMapper mapper = JsonMapper.builder().build();
    final JsonCodec json = new JsonCodec() {
        @Override public String write(Object value) { return mapper.writeValueAsString(value); }
        @Override public JsonNode readTree(String value) { return mapper.readTree(value); }
        @Override public <T> T read(String value, Class<T> type) { return mapper.readValue(value, type); }
        @Override @SuppressWarnings("unchecked")
        public Map<String, Object> readObject(String value) { return mapper.readValue(value, java.util.LinkedHashMap.class); }
    };
    final List<JsonNode> sent = new ArrayList<>();
    final List<Map<String, String>> sentHeaders = new ArrayList<>();
    final Map<String, Function<JsonNode, HttpChsNationalInsuranceClient.Transport.Response>> routes = new java.util.HashMap<>();
    HttpChsNationalInsuranceClient client;
    ChsInsuranceSettlementAdapter adapter;

    static ChsGatewayProperties properties(boolean signIn) {
        return new ChsGatewayProperties(true, "http://chs.invalid/hsa/api", "H36010001", "示例医院", "360100", "SYS01",
                "DEV1", null, null, null, "V1.0", "1", "OP0", signIn, "AA-BB", "10.0.0.8", "11", false,
                "Asia/Shanghai", Duration.ofSeconds(1), Duration.ofSeconds(1), Duration.ofMinutes(30), Map.of("X-Token", "t"), false);
    }

    @BeforeEach
    void setup() {
        client = new HttpChsNationalInsuranceClient(properties(true), json, (uri, headers, body) -> {
            JsonNode request = json.readTree(body);
            sent.add(request); sentHeaders.add(headers);
            var response = routes.get(request.path("infno").asString()).apply(request);
            if (response.status() < 0) throw new IOException("timeout");
            return response;
        }, Clock.fixed(NOW, ZoneOffset.UTC));
        adapter = new ChsInsuranceSettlementAdapter(client);
        ok("9001", "{\"signinoutb\":{\"sign_no\":\"SIGN-1\",\"sign_time\":\"2026-10-18 10:00:00\"}}");
        ok("1101", "{\"baseinfo\":{\"psn_no\":\"PSN001\",\"certno\":\"360102198801011234\",\"psn_name\":\"张三\",\"gend\":\"1\",\"brdy\":\"1988-01-01\"},"
                + "\"insuinfo\":[{\"insutype\":\"390\",\"psn_insu_stas\":\"3\",\"insuplc_admdvs\":\"360200\"},"
                + "{\"insutype\":\"310\",\"psn_insu_stas\":\"1\",\"balc\":\"1850.00\",\"psn_type\":\"11\",\"insuplc_admdvs\":\"360100\"}]}");
        ok("2201", "{\"data\":{\"mdtrt_id\":\"MDT001\"}}");
        ok("2203A", "{\"result\":{\"mdtrt_id\":\"MDT001\"}}");
        ok("2204", "{\"result\":[{\"feedetl_sn\":\"7\",\"chrgitm_lv\":\"02\"}]}");
        ok("2206", "{\"setlinfo\":" + setl("SETL-PRE", "100.00", "60.00", "10.00", "20.00", "10.00", "0.00") + "}");
        ok("2207", "{\"setlinfo\":" + setl("SETL-FINAL", "100.00", "60.00", "10.00", "20.00", "10.00", "0.00")
                .replace("}", ",\"setl_time\":\"2026-10-18 10:05:00\"}") + "}");
        ok("2208", "{\"setlinfo\":{\"setl_id\":\"REV-1\"}}");
    }

    static String setl(String id, String total, String pool, String major, String acct, String cash, String mutual) {
        return "{\"setl_id\":\"" + id + "\",\"medfee_sumamt\":\"" + total + "\",\"fund_pay_sumamt\":\"70.00\",\"hifp_pay\":\"" + pool
                + "\",\"hifob_pay\":\"" + major + "\",\"acct_pay\":\"" + acct + "\",\"psn_cash_pay\":\"" + cash
                + "\",\"acct_mulaid_pay\":\"" + mutual + "\",\"inscp_scp_amt\":\"90.00\",\"fulamt_ownpay_amt\":\"0.00\",\"preselfpay_amt\":\"10.00\"}";
    }

    void ok(String infno, String output) {
        routes.put(infno, request -> new HttpChsNationalInsuranceClient.Transport.Response(200,
                "{\"infcode\":0,\"inf_refmsgid\":\"R\",\"err_msg\":\"\",\"output\":" + output + "}"));
    }

    void rejected(String infno, String message) {
        routes.put(infno, request -> new HttpChsNationalInsuranceClient.Transport.Response(200,
                "{\"infcode\":-1,\"err_msg\":\"" + message + "\"}"));
    }

    InsuranceInstruction instruction(String memberNo) {
        return new InsuranceInstruction(1L, 2L, "SET", "KEY", 3L, 4L, 5L, 6L, "360100", "310", "H36010001", "D01", "DOC1",
                NOW, null, "HASH", List.of(new InsuranceLine(7L, 8L, "LOCAL-1", "XA01", "阿莫西林",
                new BigDecimal("2"), new BigDecimal("50"), new BigDecimal("100"), "DRUG", Map.of())),
                new BigDecimal("100"), "CNY", "CORR", memberNo, memberNo == null ? List.of() : DIAGNOSES);
    }

    static final List<InsuranceDiagnosis> DIAGNOSES = List.of(new InsuranceDiagnosis("PRIMARY", 1, "J06.900", "急性上呼吸道感染"),
            new InsuranceDiagnosis("SECONDARY", 2, "R50.900", "发热"));

    JsonNode call(String infno) {
        return sent.stream().filter(node -> infno.equals(node.path("infno").asString())).findFirst().orElseThrow();
    }

    @Test
    void personInfoUsesStandardEnvelopeAndPicksActiveInsurance() {
        var person = client.queryPersonInfo(new ChsModels.PersonInfoRequest("02", "ECTOKEN", "张三"));

        assertThat(person.psnNo()).isEqualTo("PSN001");
        assertThat(person.insutype()).isEqualTo("310");
        assertThat(person.status()).isEqualTo("NORMAL");
        assertThat(person.balc()).isEqualByComparingTo("1850.00");
        JsonNode request = call("1101");
        assertThat(request.path("fixmedins_code").asString()).isEqualTo("H36010001");
        assertThat(request.path("mdtrtarea_admvs").asString()).isEqualTo("360100");
        assertThat(request.path("sign_no").asString()).isEqualTo("SIGN-1");
        assertThat(request.path("msgid").asString()).startsWith("H3601000120261018100000");
        assertThat(request.path("input").path("data").path("mdtrt_cert_type").asString()).isEqualTo("01");
        assertThat(request.path("input").path("data").path("mdtrt_cert_no").asString()).isEqualTo("ECTOKEN");
        assertThat(sentHeaders.getFirst()).containsEntry("X-Token", "t");
        assertThat(call("9001").path("sign_no").asString()).isEmpty();
    }

    @Test
    void fullOutpatientChainMapsFundsAndKeepsReferencesOpaque() {
        client.queryPersonInfo(new ChsModels.PersonInfoRequest("01", "360102198801011234", "张三"));

        var pre = adapter.preSettle(instruction("PSN001"));
        assertThat(pre.outcome()).isEqualTo(InsuranceResult.Outcome.SUCCEEDED);
        assertThat(pre.externalSettlementNo()).isEqualTo("MDT001:SETL-PRE");
        assertThat(pre.insuranceFundAmount()).isEqualByComparingTo("60");
        assertThat(pre.otherFundAmount()).isEqualByComparingTo("10");
        assertThat(pre.personalAccountAmount()).isEqualByComparingTo("20");
        assertThat(pre.patientCashAmount()).isEqualByComparingTo("10");
        JsonNode visit = call("2203A").path("input");
        assertThat(visit.path("mdtrtinfo").path("mdtrt_id").asString()).isEqualTo("MDT001");
        assertThat(visit.path("mdtrtinfo").path("psn_no").asString()).isEqualTo("PSN001");
        assertThat(visit.path("mdtrtinfo").path("dise_codg").asString()).isEqualTo("J06.900");
        assertThat(visit.path("mdtrtinfo").path("main_cond_dscr").asString()).isEqualTo("急性上呼吸道感染");
        assertThat(visit.path("diseinfo").get(0).path("diag_type").asString()).isEqualTo("1");
        assertThat(visit.path("diseinfo").get(1).path("diag_type").asString()).isEqualTo("2");
        assertThat(visit.path("diseinfo").get(1).path("diag_srt_no").asInt()).isEqualTo(2);
        assertThat(sent.stream().map(node -> node.path("infno").asString()).filter(n -> n.startsWith("22")).toList())
                .containsExactly("2201", "2203A", "2204", "2206");
        assertThat(call("2204").path("input").path("feedetail").get(0).path("med_list_codg").asString()).isEqualTo("XA01");
        assertThat(call("2206").path("input").path("data").path("mdtrt_id").asString()).isEqualTo("MDT001");
        assertThat(call("2206").path("insuplc_admdvs").asString()).isEqualTo("360100");

        var settled = adapter.settle(instruction("PSN001"), pre.externalSettlementNo());
        assertThat(settled.outcome()).isEqualTo(InsuranceResult.Outcome.SUCCEEDED);
        assertThat(settled.externalSettlementNo()).isEqualTo("MDT001:SETL-FINAL");
        assertThat(call("2207").path("input").path("data").path("mdtrt_id").asString()).isEqualTo("MDT001");
        assertThat(call("2207").path("input").path("data").path("insutype").asString()).isEqualTo("310");

        var reversed = adapter.reverse(new InsuranceReversal(1L, 2L, "SET", "REV", "360100", "310", settled.externalSettlementNo(),
                new BigDecimal("100"), "患者取消", "CORR", 4L, 6L, "DOC1", "CNY", new BigDecimal("60"), new BigDecimal("20"),
                new BigDecimal("10"), new BigDecimal("10"), "PSN001"));
        assertThat(reversed.outcome()).isEqualTo(InsuranceResult.Outcome.SUCCEEDED);
        JsonNode reversal = call("2208").path("input").path("data");
        assertThat(reversal.path("setl_id").asString()).isEqualTo("SETL-FINAL");
        assertThat(reversal.path("mdtrt_id").asString()).isEqualTo("MDT001");
        // 每个经办人只签到一次：1101 用默认操作员，业务交易用接诊医师。
        assertThat(sent.stream().filter(node -> "9001".equals(node.path("infno").asString()))
                .map(node -> node.path("opter").asString())).containsExactly("OP0", "DOC1");
    }

    @Test
    void refusesToSettleWithoutVerifiedPersonNumberOrFreshCredential() {
        var missingNo = adapter.preSettle(instruction(null));
        assertThat(missingNo.outcome()).isEqualTo(InsuranceResult.Outcome.FAILED);
        assertThat(missingNo.errorCode()).isEqualTo("CHS_REQUEST_CONTEXT_UNCONFIRMED");

        var noCredential = adapter.preSettle(instruction("PSN001"));
        assertThat(noCredential.errorCode()).isEqualTo("CHS_REQUEST_CONTEXT_UNCONFIRMED");
        assertThat(noCredential.errorMessage()).contains("鉴权凭证");
        assertThat(sent).isEmpty();
    }

    @Test
    void missingPrimaryDiagnosisIsRefusedBeforeAnyVisitRegistration() {
        client.queryPersonInfo(new ChsModels.PersonInfoRequest("01", "360102198801011234", "张三"));
        var secondaryOnly = instruction("PSN001");
        secondaryOnly = new InsuranceInstruction(1L, 2L, "SET", "KEY", 3L, 4L, 5L, 6L, "360100", "310", "H36010001", "D01", "DOC1",
                NOW, null, "HASH", secondaryOnly.lines(), new BigDecimal("100"), "CNY", "CORR", "PSN001",
                List.of(new InsuranceDiagnosis("SECONDARY", 1, "R50.900", "发热")));
        for (var input : List.of(secondaryOnly,
                new InsuranceInstruction(1L, 2L, "SET", "KEY", 3L, 4L, 5L, 6L, "360100", "310", "H36010001", "D01", "DOC1",
                        NOW, null, "HASH", secondaryOnly.lines(), new BigDecimal("100"), "CNY", "CORR", "PSN001"))) {
            var result = adapter.preSettle(input);
            assertThat(result.outcome()).isEqualTo(InsuranceResult.Outcome.FAILED);
            assertThat(result.errorCode()).isEqualTo("CHS_REQUEST_CONTEXT_UNCONFIRMED");
            assertThat(result.errorMessage()).contains("主诊断");
        }
        assertThat(sent.stream().map(node -> node.path("infno").asString())).doesNotContain("2201", "2203A");
    }

    @Test
    void diagnosisUploadRejectionStopsBeforeFeeUpload() {
        client.queryPersonInfo(new ChsModels.PersonInfoRequest("01", "360102198801011234", "张三"));
        rejected("2203A", "诊断编码不在医保目录");
        var result = adapter.preSettle(instruction("PSN001"));
        assertThat(result.outcome()).isEqualTo(InsuranceResult.Outcome.FAILED);
        assertThat(result.errorCode()).isEqualTo("CHS_REJECTED_-1");
        assertThat(result.errorMessage()).contains("诊断编码");
        assertThat(sent.stream().map(node -> node.path("infno").asString())).doesNotContain("2204", "2206");
    }

    @Test
    void platformRejectionIsDefiniteFailureButTransportErrorsStayUncertain() {
        client.queryPersonInfo(new ChsModels.PersonInfoRequest("01", "360102198801011234", "张三"));
        rejected("2206", "该患者存在未结算记录");
        var result = adapter.preSettle(instruction("PSN001"));
        assertThat(result.outcome()).isEqualTo(InsuranceResult.Outcome.FAILED);
        assertThat(result.errorCode()).isEqualTo("CHS_REJECTED_-1");
        assertThat(result.errorMessage()).contains("未结算");

        routes.put("2207", request -> new HttpChsNationalInsuranceClient.Transport.Response(502, "bad gateway"));
        assertThatThrownBy(() -> adapter.settle(instruction("PSN001"), "MDT001:SETL-PRE"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("结果未知");
        routes.put("2207", request -> new HttpChsNationalInsuranceClient.Transport.Response(-1, ""));
        assertThatThrownBy(() -> adapter.settle(instruction("PSN001"), "MDT001:SETL-PRE"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("结果未知");
    }

    @Test
    void expiredSignInIsRenewedOnceAndTransactionResent() {
        client.queryPersonInfo(new ChsModels.PersonInfoRequest("01", "360102198801011234", "张三"));
        int[] attempts = {0};
        routes.put("2201", request -> attempts[0]++ == 0
                ? new HttpChsNationalInsuranceClient.Transport.Response(200, "{\"infcode\":-1,\"err_msg\":\"签到已失效\"}")
                : new HttpChsNationalInsuranceClient.Transport.Response(200,
                "{\"infcode\":0,\"err_msg\":\"\",\"output\":{\"data\":{\"mdtrt_id\":\"MDT001\"}}}"));
        assertThat(adapter.preSettle(instruction("PSN001")).outcome()).isEqualTo(InsuranceResult.Outcome.SUCCEEDED);
        assertThat(attempts[0]).isEqualTo(2);

        routes.put("2201", request -> new HttpChsNationalInsuranceClient.Transport.Response(200,
                "{\"infcode\":-1,\"err_msg\":\"签到已失效\"}"));
        attempts[0] = 0;
        assertThat(adapter.preSettle(instruction("PSN001")).outcome()).isEqualTo(InsuranceResult.Outcome.FAILED);
        assertThat(sent.stream().filter(n -> "2201".equals(n.path("infno").asString())).count()).isEqualTo(4);
    }

    @Test
    void missingMoneyFieldsAreNotTreatedAsZero() {
        client.queryPersonInfo(new ChsModels.PersonInfoRequest("01", "360102198801011234", "张三"));
        ok("2206", "{\"setlinfo\":{\"setl_id\":\"S\",\"medfee_sumamt\":\"100.00\",\"fund_pay_sumamt\":\"70.00\",\"hifp_pay\":\"60.00\",\"hifob_pay\":\"10.00\"}}");
        assertThatThrownBy(() -> adapter.preSettle(instruction("PSN001")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("acct_pay");
    }

    @Test
    void reversalRejectionIsReportedAsFailure() {
        rejected("2208", "原结算已撤销");
        var result = adapter.reverse(new InsuranceReversal(1L, 2L, "SET", "REV", "360100", "310", "MDT001:SETL-FINAL",
                new BigDecimal("100"), "取消", "CORR", 4L, 6L, "DOC1", "CNY", new BigDecimal("60"), new BigDecimal("20"),
                new BigDecimal("10"), new BigDecimal("10"), "PSN001"));
        assertThat(result.outcome()).isEqualTo(InsuranceResult.Outcome.FAILED);
        assertThat(result.errorCode()).isEqualTo("CHS_REVERSAL_FAILED");
    }

    @Test
    void nonNumericInsuranceCodeAliasesAreRefused() {
        client.queryPersonInfo(new ChsModels.PersonInfoRequest("01", "360102198801011234", "张三"));
        var aliased = new InsuranceInstruction(1L, 2L, "SET", "KEY", 3L, 4L, 5L, 6L, "360100", "BASIC_MEDICAL_INSURANCE",
                "H36010001", "D01", "DOC1", NOW, null, "HASH", instruction("PSN001").lines(), new BigDecimal("100"), "CNY", "CORR", "PSN001");
        assertThat(adapter.preSettle(aliased).errorCode()).isEqualTo("CHS_REQUEST_CONTEXT_UNCONFIRMED");
        assertThatThrownBy(() -> client.queryPersonInfo(new ChsModels.PersonInfoRequest("99", "X", "n"))).isInstanceOf(BusinessException.class);
    }

    @Test
    void gatewayAndMockAreMutuallyExclusiveWithStandardFallback() {
        var runner = new ApplicationContextRunner().withBean(JsonCodec.class, () -> json)
                .withUserConfiguration(StandardChsNationalInsuranceClient.class, HttpChsNationalInsuranceClient.class);
        runner.run(context -> assertThat(context.getBean(NationalInsuranceClient.class)).isInstanceOf(StandardChsNationalInsuranceClient.class));
        runner.withPropertyValues("rhn.billing.insurance.chs.gateway.enabled=true",
                        "rhn.billing.insurance.chs.gateway.base-url=http://chs.invalid/api",
                        "rhn.billing.insurance.chs.gateway.fixmedins-code=H1", "rhn.billing.insurance.chs.gateway.fixmedins-name=院",
                        "rhn.billing.insurance.chs.gateway.mdtrtarea-admvs=360100", "rhn.billing.insurance.chs.gateway.recer-sys-code=S",
                        "rhn.billing.insurance.chs.gateway.default-operator=OP", "rhn.billing.insurance.chs.gateway.sign-in-mac=A",
                        "rhn.billing.insurance.chs.gateway.sign-in-ip=1.1.1.1")
                .run(context -> assertThat(context.getBean(NationalInsuranceClient.class)).isInstanceOf(HttpChsNationalInsuranceClient.class));
        runner.withPropertyValues("rhn.billing.insurance.chs.gateway.enabled=true")
                .run(context -> assertThat(context).hasFailed());
    }
}
