package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceReadinessViews.ReadinessCheck;
import com.rhn.billing.api.InsuranceReadinessViews.ReadinessReport;
import com.rhn.billing.infrastructure.insurance.chs.HttpChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.MockChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.StandardChsNationalInsuranceClient;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InsuranceReadinessServiceTest {
    static final String SECRET_URL = "http://secret-host.invalid:9443/hsa/very-secret";
    static final ExecutionContext CONTEXT = new ExecutionContext(1L, 9L, "admin", "CORR", Set.of("MASTER_DATA.MANAGE"),
            10L, 20L, null, Set.of(), Set.of());

    InsuranceReadinessService service(MockEnvironment env, NationalInsuranceClient client,
                                      List<InsuranceQuickSubmissionProperties.Registration> registrations) {
        var provider = mock(ExecutionContextProvider.class);
        when(provider.requireCurrent()).thenReturn(CONTEXT);
        return new InsuranceReadinessService(env, new InsuranceQuickSubmissionProperties(registrations), client, provider,
                mock(OrganizationDirectory.class));
    }

    static MockEnvironment fullGateway() {
        return new MockEnvironment()
                .withProperty("rhn.billing.insurance.chs.gateway.enabled", "true")
                .withProperty("rhn.billing.insurance.chs.gateway.base-url", SECRET_URL)
                .withProperty("rhn.billing.insurance.chs.gateway.fixmedins-code", "H-SECRET-CODE")
                .withProperty("rhn.billing.insurance.chs.gateway.fixmedins-name", "保密医院")
                .withProperty("rhn.billing.insurance.chs.gateway.mdtrtarea-admvs", "360100")
                .withProperty("rhn.billing.insurance.chs.gateway.recer-sys-code", "SYS-SECRET")
                .withProperty("rhn.billing.insurance.chs.gateway.default-operator", "OP-SECRET")
                .withProperty("rhn.billing.insurance.chs.gateway.sign-in-mac", "AA-BB-SECRET")
                .withProperty("rhn.billing.insurance.chs.gateway.sign-in-ip", "10.9.8.7");
    }

    static InsuranceQuickSubmissionProperties.Registration registration(String type, Map<String, String> practitioners) {
        return new InsuranceQuickSubmissionProperties.Registration(1L, 10L, 20L, type, "360100", "ORG-SECRET",
                "DEPT-SECRET", "SYS-A", practitioners);
    }

    static ReadinessCheck find(ReadinessReport report, String code) {
        return report.sections().stream().flatMap(section -> section.checks().stream())
                .filter(check -> check.code().equals(code)).findFirst().orElseThrow();
    }

    @Test
    void unconfiguredDeploymentIsBlockedWithFixHints() {
        var report = service(new MockEnvironment(), mock(StandardChsNationalInsuranceClient.class), List.of()).check();

        assertThat(report.clientMode()).isEqualTo("UNAVAILABLE");
        assertThat(report.overall()).isEqualTo("BLOCK");
        assertThat(report.overallText()).isEqualTo("阻断");
        assertThat(find(report, "base-url").statusText()).isEqualTo("阻断");
        assertThat(find(report, "base-url").status()).isEqualTo("BLOCK");
        assertThat(find(report, "base-url").fix()).contains("rhn.billing.insurance.chs.gateway.base-url");
        assertThat(find(report, "registration-present").status()).isEqualTo("BLOCK");
    }

    @Test
    void completeGatewayAndRegistrationPassWithoutEchoingAnyConfiguredValue() throws Exception {
        var client = mock(HttpChsNationalInsuranceClient.class);
        var report = service(fullGateway(), client,
                List.of(registration("310", Map.of("doctor.a", "REG-SECRET-1")))).check();

        assertThat(report.clientMode()).isEqualTo("GATEWAY");
        assertThat(report.summary().block()).isZero();
        assertThat(report.overall()).isEqualTo("WARN");   // 在岗医师无法自动比对，保留人工确认警告
        assertThat(report.insuranceSystemCodes()).containsExactly("SYS-A");
        assertThat(find(report, "base-url").detail()).isEqualTo("已配置");
        assertThat(find(report, "base-url-format").status()).isEqualTo("WARN");   // 明文 http

        String json = new tools.jackson.databind.json.JsonMapper().writeValueAsString(report);
        for (String secret : List.of("secret-host", "very-secret", "H-SECRET-CODE", "保密医院", "SYS-SECRET", "OP-SECRET",
                "AA-BB-SECRET", "10.9.8.7", "ORG-SECRET", "DEPT-SECRET", "REG-SECRET-1", "doctor.a")) {
            assertThat(json).doesNotContain(secret);
        }
    }

    @Test
    void registrationGapsAreReportedPerRecord() {
        var report = service(fullGateway(), mock(HttpChsNationalInsuranceClient.class), List.of(
                registration("BASIC_MEDICAL_INSURANCE", Map.of()),
                new InsuranceQuickSubmissionProperties.Registration(1L, 10L, 20L, "390", "360100", null, "D", "SYS-A",
                        Map.of("d", " ")),
                new InsuranceQuickSubmissionProperties.Registration(2L, 10L, 20L, "310", "360100", "O", "D", "SYS-A", Map.of("d", "R")))).check();

        assertThat(find(report, "registration-1-insutype").status()).isEqualTo("BLOCK");
        assertThat(find(report, "registration-1-practitioners").detail()).contains("尚未登记");
        assertThat(find(report, "registration-2-fields").detail()).contains("organization-code");
        assertThat(find(report, "registration-2-practitioners").detail()).contains("1 位注册号为空");
        assertThat(report.sections().stream().flatMap(section -> section.checks().stream())
                .filter(check -> check.code().startsWith("registration-3"))).isEmpty();   // 其他租户的记录不可见
        assertThat(report.overall()).isEqualTo("BLOCK");
    }

    @Test
    void mockClientIsOnlyAWarningForTheClientModeButGatewayStaysBlocked() {
        var report = service(new MockEnvironment(), mock(MockChsNationalInsuranceClient.class), List.of()).check();
        assertThat(report.clientMode()).isEqualTo("MOCK");
        assertThat(find(report, "client-mode").status()).isEqualTo("WARN");
        assertThat(find(report, "gateway-enabled").status()).isEqualTo("BLOCK");
    }

    @Test
    void malformedGatewayPropertiesAreReportedInsteadOfFailingTheRequest() {
        var env = new MockEnvironment().withProperty("rhn.billing.insurance.chs.gateway.connect-timeout", "not-a-duration");
        var report = service(env, mock(StandardChsNationalInsuranceClient.class), List.of()).check();
        assertThat(find(report, "gateway-parse").status()).isEqualTo("BLOCK");
    }
}
