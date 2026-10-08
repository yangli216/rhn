package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.api.InsuranceSettlementAdapter.*;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import java.util.List;
import java.math.BigDecimal;
import static org.assertj.core.api.Assertions.*;

class StandardChsNationalInsuranceClientTest {
    @Test
    void mockRequiresExplicitOptIn() {
        var runner = new ApplicationContextRunner()
                .withUserConfiguration(StandardChsNationalInsuranceClient.class, MockChsNationalInsuranceClient.class);
        runner.run(context -> assertThat(context.getBean(NationalInsuranceClient.class))
                .isInstanceOf(StandardChsNationalInsuranceClient.class));
        runner.withPropertyValues("rhn.billing.insurance.chs.mock-enabled=true")
                .run(context -> assertThat(context.getBean(NationalInsuranceClient.class))
                        .isInstanceOf(MockChsNationalInsuranceClient.class));
    }

    @Test
    void nonMockConfigurationCannotCreateSuccessfulTransactions() {
        new ApplicationContextRunner()
                .withUserConfiguration(StandardChsNationalInsuranceClient.class, MockChsNationalInsuranceClient.class)
                .withPropertyValues("rhn.billing.insurance.chs.mock-enabled=false")
                .run(context -> {
                    var client = context.getBean(NationalInsuranceClient.class);
                    assertThat(client).isInstanceOf(StandardChsNationalInsuranceClient.class);
                    assertThatThrownBy(() -> client.queryPersonInfo(new ChsModels.PersonInfoRequest("01", "TEST", "测试")))
                            .isInstanceOf(BusinessException.class).hasMessageContaining("尚未接入");
                    assertThatThrownBy(() -> client.preparePreSettle(null)).isInstanceOf(BusinessException.class);
                    assertThatThrownBy(() -> client.prepareSettle(null, "PRE")).isInstanceOf(BusinessException.class);
                    assertThatThrownBy(() -> client.prepareReversal(null)).isInstanceOf(BusinessException.class);
                    var request = new ChsModels.PreSettleRequest("PSN", "310", 1L, "SETTLE", new BigDecimal("100"),
                            "ORG", "DEPT", "DOC", List.of());
                    assertThatThrownBy(() -> client.preSettle(request)).isInstanceOf(BusinessException.class);
                    assertThatThrownBy(() -> client.settle(new ChsModels.SettleRequest("PRE", "PSN", "SETTLE", "DOC")))
                            .isInstanceOf(BusinessException.class);
                    assertThatThrownBy(() -> client.reverse(new ChsModels.ReversalRequest("SETL", "PSN", "DOC", "取消")))
                            .isInstanceOf(BusinessException.class);
                    var adapter = new ChsInsuranceSettlementAdapter(client);
                    var instruction = new InsuranceInstruction(1L, 2L, "SETTLE", "KEY", 3L, 4L, 5L, 6L,
                            "REGION", "310", "ORG", "DEPT", "DOC", null, null, null, List.of(), BigDecimal.TEN, "CNY", "CORR");
                    assertThat(adapter.query(new InsuranceQuery(1L, "CLAIM", "SETTLE", "REGION", "310", "PRE", "SETL", "CORR")).outcome())
                            .isEqualTo(InsuranceResult.Outcome.PENDING);
                    var results = List.of(adapter.preSettle(instruction), adapter.settle(instruction, "PRE"),
                            adapter.reverse(new InsuranceReversal(1L, 2L, "SETTLE", "KEY", "REGION", "310", "SETL", BigDecimal.TEN, "取消", "CORR",
                                    4L, 6L, "DOC", "CNY", BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO)));
                    assertThat(results).allSatisfy(result -> {
                        assertThat(result.outcome()).isEqualTo(InsuranceResult.Outcome.FAILED);
                        assertThat(result.errorCode()).isEqualTo("CHS_GATEWAY_NOT_IMPLEMENTED");
                        assertThat(result.externalSettlementNo()).isNull();
                    });
                });
    }

    @Test
    void unsupportedStatusQueryMustNotConfirmSuccess() {
        var adapter = new ChsInsuranceSettlementAdapter(new MockChsNationalInsuranceClient());
        var result = adapter.query(new InsuranceQuery(1L, "CLAIM", "SETTLE", "REGION", "310", "PRE", "SETL", "CORR"));
        assertThat(result.outcome()).isEqualTo(InsuranceResult.Outcome.PENDING);
    }
}
