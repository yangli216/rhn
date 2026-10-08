package com.rhn.billing.infrastructure.fiscal;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.*;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import java.math.BigDecimal;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

class StandardFiscalReceiptClientTest {
    @Test
    void mockRequiresExplicitOptIn() {
        var runner = new ApplicationContextRunner()
                .withUserConfiguration(StandardFiscalReceiptClient.class, MockFiscalReceiptClient.class);
        runner.run(context -> assertThat(context.getBean(NationalFiscalReceiptClient.class))
                .isInstanceOf(StandardFiscalReceiptClient.class));
        runner.withPropertyValues("rhn.billing.fiscal.mock-enabled=true")
                .run(context -> assertThat(context.getBean(NationalFiscalReceiptClient.class))
                        .isInstanceOf(MockFiscalReceiptClient.class));
    }

    @Test
    void nonMockConfigurationCannotIssueOrConfirmInventedReceipts() {
        new ApplicationContextRunner()
                .withUserConfiguration(StandardFiscalReceiptClient.class, MockFiscalReceiptClient.class)
                .withPropertyValues("rhn.billing.fiscal.mock-enabled=false")
                .run(context -> {
                    var client = context.getBean(NationalFiscalReceiptClient.class);
                    assertThat(client).isInstanceOf(StandardFiscalReceiptClient.class);
                    var request = new FiscalIssueRequest(1L, 2L, "REQ", "KEY", "MEDICAL_E_INVOICE", "WINDOW",
                            "DEFAULT", "测试", null, BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.TEN, BigDecimal.ZERO,
                            "CNY", List.of(), "CORR");
                    var result = client.issue(request);
                    assertThat(result.success()).isFalse();
                    assertThat(result.fiscalNumber()).isNull();
                    assertThat(result.verifyUrl()).isNull();
                    assertThat(client.query("REQ", "EXTERNAL", "CORR").success()).isFalse();
                    assertThat(client.voidReceipt(new FiscalVoidRequest(1L, "REQ", "KEY", "EXTERNAL", "取消", "CORR")).success()).isFalse();
                    assertThat(client.redFlush(new FiscalRedFlushRequest(1L, "REQ", "KEY", "EXTERNAL", "CODE", "NUMBER", "取消", "CORR")).success()).isFalse();
                    var adapterResult = new ProvincialFiscalReceiptAdapter(client).query("REQ", "EXTERNAL", "CORR");
                    assertThat(adapterResult.outcome()).isEqualTo(ReceiptResult.Outcome.PENDING);
                    assertThat(adapterResult.errorCode()).isEqualTo("FISCAL_GATEWAY_NOT_IMPLEMENTED");
                });
    }
}
