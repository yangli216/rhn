package com.rhn;

import com.rhn.billing.api.BillingViews.ChargeItemView;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(BillingDisplayDictionaryTest.DisplayController.class)
class BillingDisplayDictionaryTest extends RhnIntegrationTestSupport {
    @Test
    void charge_text_uses_platform_then_tenant_names_and_keeps_inactive_history() throws Exception {
        mockMvc.perform(get("/api/test/billing-display").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.charges[0].accountingCategory").value("LABORATORY"))
                .andExpect(jsonPath("$.charges[0].accountingCategoryText").value("检验费"))
                .andExpect(jsonPath("$.charges[1].accountingCategoryText").value("REHAB"))
                .andExpect(jsonPath("$.charges[2].accountingCategoryText").value("UNKNOWN"));
        var created = json(mockMvc.perform(post("/api/platform/dictionaries").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"scopeType":"TENANT","categoryId":"9223009648984985598","code":"BD_ACCOUNTING_CATEGORY",
                         "name":"本院费用归并","requestCode":"%s"}
                        """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String dictionaryId = created.path("id").asString();
        var item = json(mockMvc.perform(post("/api/platform/dictionaries/{id}/items", dictionaryId).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":"0","code":"LABORATORY","name":"本院检验收费",
                         "sortOrder":10,"requestCode":"%s"}
                        """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String itemId = item.path("items").get(0).path("id").asString();
        mockMvc.perform(post("/api/platform/dictionaries/{id}/items", dictionaryId).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":"1","code":"REHAB","name":"康复理疗费",
                         "sortOrder":20,"requestCode":"%s"}
                        """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/platform/dictionaries/{id}/items/{itemId}/disable", dictionaryId, itemId).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":"2","requestCode":"%s"}
                        """.formatted(UUID.randomUUID())))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/test/billing-display").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.charges[0].accountingCategoryText").value("本院检验收费"))
                .andExpect(jsonPath("$.charges[1].accountingCategoryText").value("康复理疗费"))
                .andExpect(jsonPath("$.charges[2].accountingCategoryText").value("UNKNOWN"));
        mockMvc.perform(get("/api/test/billing-display").with(rhn("362387869790210")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.charges[0].accountingCategoryText").value("检验费"));
    }

    @RestController
    static class DisplayController {
        @GetMapping("/api/test/billing-display")
        Map<String, List<ChargeItemView>> response() {
            return Map.of("charges", List.of(charge("LABORATORY"), charge("REHAB"), charge("UNKNOWN")));
        }
        private ChargeItemView charge(String category) {
            return new ChargeItemView(null, null, null, null, null, null, "SERVICE_REQUEST", null,
                    null, null, null, "EA", null, null, "CNY", null, null, null, null, null,
                    null, null, null, null, null, "项", category, null);
        }
    }
}
