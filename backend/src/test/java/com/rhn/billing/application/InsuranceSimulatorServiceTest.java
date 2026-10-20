package com.rhn.billing.application;

import com.rhn.billing.infrastructure.insurance.chs.HttpChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.MockChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.StandardChsNationalInsuranceClient;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class InsuranceSimulatorServiceTest {
    static MockEnvironment gateway(String baseUrl) {
        return new MockEnvironment()
                .withProperty("rhn.billing.insurance.chs.simulator.enabled", "true")
                .withProperty("rhn.billing.insurance.chs.gateway.enabled", "true")
                .withProperty("rhn.billing.insurance.chs.gateway.base-url", baseUrl)
                .withProperty("rhn.billing.insurance.chs.gateway.fixmedins-code", "MOCK0001")
                .withProperty("rhn.billing.insurance.chs.gateway.fixmedins-name", "联调测试医院")
                .withProperty("rhn.billing.insurance.chs.gateway.mdtrtarea-admvs", "360100")
                .withProperty("rhn.billing.insurance.chs.gateway.recer-sys-code", "MOCKSYS")
                .withProperty("rhn.billing.insurance.chs.gateway.default-operator", "MOCKOP")
                .withProperty("rhn.billing.insurance.chs.gateway.sign-in-mac", "00-00-00-00-00-01")
                .withProperty("rhn.billing.insurance.chs.gateway.sign-in-ip", "127.0.0.1");
    }

    @Test
    void disabledByDefaultEvenWithMockClient() {
        var view = new InsuranceSimulatorService(new MockEnvironment(), mock(MockChsNationalInsuranceClient.class)).view();
        assertThat(view.enabled()).isFalse();
        assertThat(view.personas()).isEmpty();
        assertThat(view.reason()).isNull();
    }

    @Test
    void enabledForGatewayPointingAtLoopbackMockServer() {
        var view = new InsuranceSimulatorService(gateway("http://127.0.0.1:18090/hsa/api"),
                mock(HttpChsNationalInsuranceClient.class)).view();
        assertThat(view.enabled()).isTrue();
        assertThat(view.mode()).isEqualTo("GATEWAY");
        assertThat(view.consoleUrl()).isEqualTo("http://127.0.0.1:18090");
        assertThat(view.personas()).extracting(InsuranceSimulatorService.Persona::certNo)
                .contains("TEST-310", "TEST-390", "TEST-NOINSU", "TEST-SIGN-EXPIRE");
        assertThat(view.personas()).extracting(InsuranceSimulatorService.Persona::residentKeyword).doesNotHaveDuplicates();
    }

    @Test
    void refusesToStartWhenGatewayIsNotLocal() {
        assertThatThrownBy(() -> new InsuranceSimulatorService(gateway("https://ybj.example.gov.cn/hsa/api"),
                mock(HttpChsNationalInsuranceClient.class)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("本机地址");
    }

    @Test
    void inactiveWhenNoInsuranceClientIsEnabled() {
        var view = new InsuranceSimulatorService(new MockEnvironment()
                .withProperty("rhn.billing.insurance.chs.simulator.enabled", "true"),
                mock(StandardChsNationalInsuranceClient.class)).view();
        assertThat(view.enabled()).isFalse();
        assertThat(view.reason()).contains("未启用");
    }

    @Test
    void mockClientIsAlsoSupported() {
        var view = new InsuranceSimulatorService(new MockEnvironment()
                .withProperty("rhn.billing.insurance.chs.simulator.enabled", "true"),
                mock(MockChsNationalInsuranceClient.class)).view();
        assertThat(view.enabled()).isTrue();
        assertThat(view.mode()).isEqualTo("MOCK");
        assertThat(view.consoleUrl()).isNull();
    }
}
