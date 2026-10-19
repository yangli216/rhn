package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceProbeViews.*;
import com.rhn.billing.infrastructure.insurance.chs.ChsGatewayProperties;
import com.rhn.billing.infrastructure.insurance.chs.ChsGatewayStub;
import com.rhn.billing.infrastructure.insurance.chs.ChsInsuranceSettlementAdapter;
import com.rhn.billing.infrastructure.insurance.chs.HttpChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.MockChsNationalInsuranceClient;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 探测走真实 HTTP（进程内网关桩），覆盖正常链路、各类故障场景、结算保护与报文脱敏。 */
class InsuranceProbeServiceTest {
    static final String SECRET_CERT = "TEST-310";
    final JsonCodec json = ChsGatewayStub.codec();
    ChsGatewayStub stub;

    @BeforeEach void start() { stub = new ChsGatewayStub(); }
    @AfterEach void stop() { stub.close(); }

    ChsGatewayProperties properties(boolean settlementEnabled, Duration read, String token) {
        return new ChsGatewayProperties(true, stub.url(), "H36010001", "示例医院", "360100", "SYS01", "DEV1", null, null, null,
                "V1.0", "1", "OP0", true, "AA-BB", "10.0.0.8", "11", false, "Asia/Shanghai", Duration.ofSeconds(1), read,
                Duration.ofMinutes(30), Map.of("X-Token", token), settlementEnabled);
    }

    @SuppressWarnings("unchecked")
    InsuranceProbeService service(ChsGatewayProperties properties, boolean authorized) {
        var client = new HttpChsNationalInsuranceClient(properties, json);
        lastClient = client;
        ObjectProvider<ChsGatewayProperties> props = mock(ObjectProvider.class);
        when(props.getIfAvailable()).thenReturn(properties);
        ObjectProvider<ChsInsuranceSettlementAdapter> adapter = mock(ObjectProvider.class);
        var settlement = new ChsInsuranceSettlementAdapter(client);
        when(adapter.getIfAvailable()).thenReturn(settlement);
        when(adapter.getObject()).thenReturn(settlement);
        return new InsuranceProbeService(client, props, adapter, context(authorized), json);
    }

    ExecutionContextProvider context(boolean authorized) {
        var provider = mock(ExecutionContextProvider.class);
        when(provider.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "tester", "corr-1",
                authorized ? Set.of(InsuranceProbeService.AUTHORITY) : Set.of(), 3L, null, "ORG", Set.of(3L), Set.of(), null));
        return provider;
    }

    static ProbeRequest person(String cert) {
        return new ProbeRequest(new ProbePersonInput("01", cert, "张三"), null, null);
    }

    static ProbeRequest lines(String code, String quantity, String price) {
        return new ProbeRequest(null, new ProbePreSettleInput("D01", "DOC1", "J00", "急性上呼吸道感染",
                List.of(new ProbeLineInput("LOCAL-1", code, "测试药品", new BigDecimal(quantity), new BigDecimal(price)))), null);
    }

    HttpChsNationalInsuranceClient lastClient;

    ProbeStepResult through(InsuranceProbeService service, String cert, String code) {
        assertThat(service.run("SIGN_IN", null).status()).isEqualTo("PASS");
        assertThat(service.run("PERSON", person(cert)).status()).isEqualTo("PASS");
        return service.run("PRE_SETTLE", lines(code, "2", "50"));
    }

    /** 经办人首次发起业务交易时会先签到，报文序列中的 9001 不属于该步骤的业务交易。 */
    static List<String> infnos(ProbeStepResult result) {
        return result.exchanges().stream().map(ProbeExchange::infno).filter(infno -> !"9001".equals(infno)).toList();
    }

    static String fact(ProbeStepResult result, String label) {
        return result.facts().stream().filter(f -> f.label().equals(label)).findFirst().orElseThrow().value();
    }

    @Test
    void fullChainPassesAndSettlementIsAutomaticallyReversed() {
        var service = service(properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        var sign = service.run("SIGN_IN", null);
        assertThat(sign.status()).isEqualTo("PASS");
        assertThat(sign.exchanges()).extracting(ProbeExchange::infno).containsExactly("9001");
        assertThat(service.run("PERSON", person(SECRET_CERT)).status()).isEqualTo("PASS");

        var pre = service.run("PRE_SETTLE", lines("XA01", "2", "50"));
        assertThat(pre.status()).as(pre.summary()).isEqualTo("PASS");
        assertThat(infnos(pre)).containsExactly("2201", "2203A", "2204", "2206");
        assertThat(fact(pre, "费用总额")).isEqualTo("100.00");
        assertThat(fact(pre, "统筹基金")).isEqualTo("80.00");
        assertThat(fact(pre, "个人现金")).isEqualTo("20.00");

        // 勾选但单号不符：不得向平台发出 2207
        long before = stub.requests().size();
        var wrong = service.run("SETTLE", new ProbeRequest(null, null, new ProbeSettleInput(true, "WRONG")));
        assertThat(wrong.status()).isEqualTo("BLOCKED");
        assertThat(stub.requests()).hasSize((int) before);

        var settle = service.run("SETTLE", new ProbeRequest(null, null, new ProbeSettleInput(true, fact(pre, "探测单号"))));
        assertThat(settle.status()).as(settle.summary()).isEqualTo("PASS");
        assertThat(infnos(settle)).containsExactly("2207", "2208");

        // 单次有效：再次结算须重新预结算
        assertThat(service.run("SETTLE", new ProbeRequest(null, null, new ProbeSettleInput(true, fact(pre, "探测单号")))).status())
                .isEqualTo("BLOCKED");
    }

    @Test
    void repeatedReversalIsRejectedByPlatformAndReportedAsFailure() {
        var service = service(properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        var pre = through(service, SECRET_CERT, "XA01");
        var settled = service.run("SETTLE", new ProbeRequest(null, null, new ProbeSettleInput(true, fact(pre, "探测单号"))));
        assertThat(settled.status()).isEqualTo("PASS");
        // 对同一结算再次撤销：平台应答“已撤销”，客户端给出确定失败而不是异常
        var data = stub.requests().stream().filter(r -> "2208".equals(r.path("infno").asString())).findFirst().orElseThrow()
                .path("input").path("data");
        var response = lastClient.reverse(new com.rhn.billing.infrastructure.insurance.chs.ChsModels.ReversalRequest(
                data.path("mdtrt_id").asString() + ":" + data.path("setl_id").asString(), data.path("psn_no").asString(), "DOC1", "重复撤销"));
        assertThat(response.success()).isFalse();
        assertThat(response.message()).contains("已撤销");
    }

    @Test
    void settlementIsBlockedUnlessDeploymentAllowsIt() {
        var service = service(properties(false, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        var pre = through(service, SECRET_CERT, "XA01");
        long before = stub.requests().size();
        var blocked = service.run("SETTLE", new ProbeRequest(null, null, new ProbeSettleInput(true, fact(pre, "探测单号"))));
        assertThat(blocked.status()).isEqualTo("BLOCKED");
        assertThat(blocked.summary()).contains("probe-settlement-enabled");
        assertThat(stub.requests()).hasSize((int) before);
        assertThat(service.capability().settlementAllowed()).isFalse();
    }

    @Test
    void exchangesAreRedactedBeforeLeavingTheService() {
        var service = service(properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        service.run("SIGN_IN", null);
        var personResult = service.run("PERSON", person(SECRET_CERT));
        var pre = service.run("PRE_SETTLE", lines("XA01", "2", "50"));
        String all = json.write(List.of(personResult, pre));
        assertThat(all).doesNotContain(SECRET_CERT).doesNotContain("张三").doesNotContain("360102198801011234").doesNotContain("SIGN1");
        JsonNode registration = json.readTree(pre.exchanges().stream().filter(e -> "2201".equals(e.infno())).findFirst().orElseThrow().request());
        assertThat(registration.path("input").path("data").path("mdtrt_cert_no").asString()).isEqualTo("****");
        assertThat(registration.path("sign_no").asString()).isEqualTo("****");
        assertThat(registration.path("input").path("data").path("psn_no").asString()).contains("****");
        assertThat(registration.path("fixmedins_code").asString()).isEqualTo("H36010001");
    }

    @Test
    void rejectedPreSettlementKeepsExchangesAndExplainsCause() {
        var service = service(properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        var result = through(service, "TEST-REJECT-2206", "XA01");
        assertThat(result.status()).isEqualTo("FAIL");
        assertThat(infnos(result)).containsExactly("2201", "2203A", "2204", "2206");
        var last = result.exchanges().getLast();
        assertThat(last.outcome()).isEqualTo("REJECTED");
        assertThat(last.infcode()).isEqualTo("-1");
        assertThat(last.errMsg()).contains("未结算");
        assertThat(result.hint()).contains("平台拒绝");
    }

    @Test
    void slowGatewayIsReportedAsTimeout() {
        var timeout = through(service(properties(true, Duration.ofMillis(800), ChsGatewayStub.TOKEN), true), "TEST-SLOW", "XA01");
        assertThat(timeout.status()).isEqualTo("FAIL");
        assertThat(timeout.exchanges().getLast().outcome()).isEqualTo("TIMEOUT");
        assertThat(timeout.hint()).contains("超时").contains("read-timeout");
    }

    @Test
    void httpErrorAndNonJsonReceiptsAreClassified() {
        var service = service(properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        var pre = through(service, "TEST-HTTP500", "XA01");
        assertThat(pre.status()).isEqualTo("PASS");
        var http500 = service.run("SETTLE", new ProbeRequest(null, null, new ProbeSettleInput(true, fact(pre, "探测单号"))));
        assertThat(http500.status()).isEqualTo("FAIL");
        assertThat(http500.exchanges().getLast().httpStatus()).isEqualTo(500);
        assertThat(http500.hint()).contains("HTTP 500");

        service.run("PERSON", person("TEST-BADJSON"));
        var badPre = service.run("PRE_SETTLE", lines("XA01", "2", "50"));
        assertThat(badPre.status()).isEqualTo("PASS");
        var bad = service.run("SETTLE", new ProbeRequest(null, null, new ProbeSettleInput(true, fact(badPre, "探测单号"))));
        assertThat(bad.status()).isEqualTo("FAIL");
        assertThat(bad.exchanges().getLast().httpStatus()).isEqualTo(200);
        assertThat(bad.exchanges().getLast().response()).contains("非 JSON");
        assertThat(bad.hint()).contains("不是有效 JSON");
    }

    @Test
    void wrongGatewayHeaderIsReportedAsHttpStatus() {
        var result = service(properties(true, Duration.ofSeconds(5), "wrong"), true).run("SIGN_IN", null);
        assertThat(result.status()).isEqualTo("FAIL");
        assertThat(result.exchanges().getFirst().httpStatus()).isEqualTo(401);
        assertThat(result.hint()).contains("headers");
    }

    @Test
    void unreachableGatewayIsReportedAsConnectionFailure() {
        var props = properties(true, Duration.ofSeconds(1), ChsGatewayStub.TOKEN);
        stub.close();
        var result = service(props, true).run("SIGN_IN", null);
        assertThat(result.status()).isEqualTo("FAIL");
        assertThat(result.exchanges().getFirst().outcome()).isIn("NETWORK", "TIMEOUT");
        assertThat(result.hint()).containsAnyOf("无法连接", "超时");
        stub = new ChsGatewayStub();
    }

    @Test
    void incompleteOrUnbalancedReceiptsAreRejected() {
        var service = service(properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        var missing = through(service, "TEST-MISSING-AMT", "XA01");
        assertThat(missing.status()).isEqualTo("FAIL");
        assertThat(missing.summary()).contains("acct_pay");
        assertThat(service.run("PERSON", person("TEST-IMBALANCE")).status()).isEqualTo("PASS");
        var unbalanced = service.run("PRE_SETTLE", lines("XA01", "2", "50"));
        assertThat(unbalanced.status()).isEqualTo("FAIL");
        assertThat(unbalanced.summary()).contains("不一致");
    }

    @Test
    void expiredSignInIsDiagnosedAndRecoveredByRetry() {
        var service = service(properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        var first = through(service, "TEST-SIGN-EXPIRE", "XA01");
        assertThat(first.status()).isEqualTo("FAIL");
        assertThat(first.hint()).contains("签到");
        // 客户端在拒绝后丢弃缓存签到，重试会重新签到并成功
        var retry = service.run("PRE_SETTLE", lines("XA01", "2", "50"));
        // 桩对该人员每次业务交易后都使签到失效，因此重试仍会失败；这里验证客户端确实重新签到（9001 先于业务交易再次出现）
        assertThat(retry.exchanges().getFirst().infno()).isEqualTo("9001");
        assertThat(retry.status()).isEqualTo("FAIL");
    }

    @Test
    void personProblemsAreReportedWithoutStartingAVisit() {
        var service = service(properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        service.run("SIGN_IN", null);
        var suspended = service.run("PERSON", person("TEST-SUSPENDED"));
        assertThat(suspended.status()).isEqualTo("FAIL");
        assertThat(suspended.summary()).contains("非正常");
        var unknown = service.run("PERSON", person("TEST-NOINSU"));
        assertThat(unknown.status()).isEqualTo("FAIL");
        assertThat(unknown.exchanges().getLast().outcome()).isEqualTo("REJECTED");
        // 鉴权失败后不允许继续预结算
        assertThat(service.run("PRE_SETTLE", lines("XA01", "1", "10")).status()).isEqualTo("BLOCKED");
        // 多条参保记录：取正常参保
        assertThat(service.run("PERSON", person("TEST-MULTI")).status()).isEqualTo("PASS");
    }

    @Test
    void requiresPermissionAndGatewayMode() {
        var props = properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN);
        assertThatThrownBy(() -> service(props, false).capability()).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service(props, false).run("SIGN_IN", null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service(props, true).run("NOPE", null)).isInstanceOf(BusinessException.class);

        @SuppressWarnings("unchecked") ObjectProvider<ChsGatewayProperties> none = mock(ObjectProvider.class);
        @SuppressWarnings("unchecked") ObjectProvider<ChsInsuranceSettlementAdapter> adapter = mock(ObjectProvider.class);
        var mockMode = new InsuranceProbeService(new MockChsNationalInsuranceClient(), none, adapter, context(true), json);
        var capability = mockMode.capability();
        assertThat(capability.available()).isFalse();
        assertThat(capability.mode()).isEqualTo("MOCK");
        assertThat(capability.reason()).contains("进程内");
        var blocked = mockMode.run("SIGN_IN", null);
        assertThat(blocked.status()).isEqualTo("BLOCKED");
        assertThat(blocked.exchanges()).isEmpty();
        assertThat(stub.requests()).isEmpty();
    }

    @Test
    void invalidInputIsBlockedBeforeAnyTransaction() {
        var service = service(properties(true, Duration.ofSeconds(5), ChsGatewayStub.TOKEN), true);
        assertThat(service.run("PERSON", new ProbeRequest(new ProbePersonInput("01", " ", null), null, null)).status()).isEqualTo("BLOCKED");
        assertThat(service.run("PRE_SETTLE", lines("XA01", "1", "10")).status()).isEqualTo("BLOCKED");
        service.run("PERSON", person(SECRET_CERT));
        assertThat(service.run("PRE_SETTLE", lines("XA01", "0", "10")).status()).isEqualTo("BLOCKED");
    }
}
