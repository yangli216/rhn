package com.rhn;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CashierCloseContractTest extends RhnIntegrationTestSupport {
    @Test
    void preview_contract_exposes_book_values_without_fabricated_actuals() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var spec = json(body);
        assertThat(spec.path("paths").path("/api/billing/cashier-closes/preview").path("get")
                .path("operationId").asString()).isEqualTo("previewCashierClose");
        mockMvc.perform(get("/api/billing/cashier-closes/preview").with(rhn())
                        .queryParam("terminalCode", "TEST").queryParam("rangeFrom", "2026-10-03T00:00:00Z")
                        .queryParam("rangeTo", "2026-10-03T01:00:00Z"))
                .andExpect(status().isForbidden());
        var schema = spec.path("components").path("schemas").path("CashierClosePreviewLine").path("properties");
        assertThat(schema.has("expectedAmount")).isTrue();
        assertThat(schema.has("actualAmount")).isFalse();
        String export = System.getProperty("rhn.test.openapi-export");
        if (export != null) Files.writeString(Path.of(export), body);
    }
}
