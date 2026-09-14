package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class StockCountWorkflowTest extends RhnIntegrationTestSupport {
    private static final String PRODUCT = "362387869795113";
    private static final String PACKAGE = "362387869795403";

    @Test
    void count_variance_approval_adjustment_and_stale_snapshot_protection_form_closed_loop() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        JsonNode site = createSite(suffix);
        JsonNode item = createItem(site.get("id").asString());
        JsonNode bin = createBin(site.get("id").asString());
        JsonNode lot = createLot(item.get("id").asString(), suffix);
        receive("CT-RCV-" + suffix, item, bin, lot, 1);

        JsonNode count = createCount(site, "CT-" + suffix);
        String id = count.get("id").asString();
        String lineId = count.at("/lines/0/id").asString();
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/start", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COUNTING"));
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/records", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"description":"双人复盘","lines":[
                                  {"countLineId":"%s","countedQuantity":12,"varianceReason":"破损漏记"}
                                ]}
                                """.formatted(lineId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].countResult").value("SHORTAGE"))
                .andExpect(jsonPath("$.lines[0].varianceQuantity").value(-2.0));
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/submit", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUBMITTED"));
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/approve", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"复核同意\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        JsonNode posted = json(mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/post", id)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("POSTED"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/post", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.inventoryTransactionId")
                        .value(posted.get("inventoryTransactionId").asString()));
        mockMvc.perform(get("/api/pharmacy/inventory/balances").with(rhnWorkContext())
                        .param("stockSiteId", site.get("id").asString())
                        .param("stockItemId", item.get("id").asString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].quantityOnHand").value(12.0));
        mockMvc.perform(get("/api/pharmacy/inventory/balances").with(rhnWorkContext())
                        .param("stockSiteId", site.get("id").asString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].stockItemId").value(item.get("id").asString()))
                .andExpect(jsonPath("$[0].quantityOnHand").value(12.0));
        mockMvc.perform(get("/api/pharmacy/inventory/transactions").with(rhnWorkContext())
                        .param("stockSiteId", site.get("id").asString())
                        .param("stockItemId", item.get("id").asString())
                        .param("allPeriods", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[*].lines[0].stockItemId")
                        .value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.equalTo(item.get("id").asString()))));

        JsonNode stale = createCount(site, "CT-STALE-" + suffix);
        String staleId = stale.get("id").asString();
        String staleLineId = stale.at("/lines/0/id").asString();
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/start", staleId).with(rhnWorkContext()))
                .andExpect(status().isOk());
        receive("CT-LATE-" + suffix, item, bin, lot, 1);
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/records", staleId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lines":[{"countLineId":"%s","countedQuantity":12}]}
                                """.formatted(staleLineId)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/submit", staleId).with(rhnWorkContext()))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/approve", staleId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/pharmacy/stock-counts/{id}/post", staleId).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("COUNT_BALANCE_CHANGED"));
    }

    private JsonNode createCount(JsonNode site, String request) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-counts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"stockSiteId":"%s","requestCode":"%s","countType":"FULL","reason":"月末盘点"}
                                """.formatted(site.get("id").asString(), request)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode createSite(String suffix) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"CT-%s","name":"盘点药库%s",
                                 "siteType":"WAREHOUSE","serviceScope":"MIXED","validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode createItem(String siteId) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-items", siteId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                 "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                 "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false}
                                """.formatted(PRODUCT, PACKAGE)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode createBin(String siteId) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-bins", siteId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"CT-A","name":"盘点位","binType":"BIN","stockDefault":"AVAILABLE",
                                 "receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":10}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode createLot(String itemId, String suffix) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-items/{id}/lots", itemId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lotNo":"CT-%s","productionDate":"2026-01-01","expiryDate":"2028-01-01",
                                 "qualityStatus":"QUALIFIED"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private void receive(String request, JsonNode item, JsonNode bin, JsonNode lot, int quantity) throws Exception {
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"%s","sourceCode":"%s","stockItemId":"%s","stockBinId":"%s",
                                 "stockLotId":"%s","operationQuantity":%d,"unitCost":10,
                                 "occurredAt":"%s"}
                                """.formatted(request, request, item.get("id").asString(), bin.get("id").asString(),
                                lot.get("id").asString(), quantity, Instant.now())))
                .andExpect(status().isCreated());
    }
}
