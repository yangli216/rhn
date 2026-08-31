package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class InventoryPriceAdjustmentWorkflowTest extends RhnIntegrationTestSupport {
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";

    @Autowired JdbcTemplate jdbc;

    @Test
    void cost_revalue_rejects_stale_preview_and_enters_period_value_ledger() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        Fixture fixture = createFixture(suffix); String lotId = createLot(fixture.itemId(), "PA-" + suffix);
        receive("PA-R1-" + suffix, fixture, lotId, "2");

        JsonNode stale = createAdjustment(fixture, "PA-STALE-" + suffix, "10.00");
        submitApprove(stale.get("id").asText());
        receive("PA-R2-" + suffix, fixture, lotId, "1");
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", stale.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRICE_ADJUSTMENT_PREVIEW_STALE"));

        JsonNode current = createAdjustment(fixture, "PA-CURRENT-" + suffix, "10.50");
        JsonNode submitted = submitApprove(current.get("id").asText());
        assertEquals(0, submitted.get("totalAdjustmentAmount").decimalValue().compareTo(new BigDecimal("84.000000")));
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", current.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.inventoryPeriodId").isNotEmpty())
                .andExpect(jsonPath("$.lines[0].lineStatus").value("POSTED"))
                .andExpect(jsonPath("$.lines[0].details[0].valuationEntryId").isNotEmpty());

        JsonNode balances = json(mockMvc.perform(get("/api/pharmacy/inventory/balances").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId()).queryParam("stockItemId", fixture.itemId()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(0, balances.get(0).get("quantityOnHand").decimalValue().compareTo(new BigDecimal("42")));
        assertEquals(0, balances.get(0).get("averageUnitCost").decimalValue().compareTo(new BigDecimal("10.5")));
        assertEquals(1, jdbc.queryForObject("select count(*) from inventory_valuation_entries where source_id = ?",
                Integer.class, Long.valueOf(current.get("id").asText())));

        JsonNode period = periods(fixture.siteId()).get(0);
        JsonNode close = json(mockMvc.perform(post("/api/pharmacy/inventory-periods/{id}/close-runs", period.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"PA-CLOSE-%s\",\"currencyCode\":\"CNY\"}".formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(0, close.at("/totals/0/movementAmount").decimalValue().compareTo(new BigDecimal("357.000000")));
        assertEquals(0, close.at("/totals/0/valuationAdjustmentAmount").decimalValue().compareTo(new BigDecimal("84.000000")));
        assertEquals(0, close.at("/totals/0/closingValue").decimalValue().compareTo(new BigDecimal("441.000000")));
        assertEquals(0, close.get("differenceCount").asInt());
    }

    private JsonNode createAdjustment(Fixture fixture, String requestCode, String newCost) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "stockSiteId":"%s","requestCode":"%s","adjustmentType":"COST_REVALUE",
                                  "businessDate":"2026-08-30","currencyCode":"CNY","priceDocumentCode":"COST-TEST",
                                  "reason":"测试成本重估","lines":[{"stockItemId":"%s","newUnitCost":%s}]
                                }
                                """.formatted(fixture.siteId(), requestCode, fixture.itemId(), newCost)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode submitApprove(String id) throws Exception {
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/submit", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUBMITTED"));
        return json(mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/approve", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"))
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode periods(String siteId) throws Exception {
        return json(mockMvc.perform(get("/api/pharmacy/inventory-periods").with(rhnWorkContext())
                        .queryParam("stockSiteId", siteId)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private void receive(String requestCode, Fixture fixture, String lotId, String quantity) throws Exception {
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "requestCode":"%s","sourceCode":"%s","stockItemId":"%s",
                                  "stockBinId":"%s","stockLotId":"%s","operationQuantity":%s,
                                  "unitCost":8.50,"occurredAt":"2026-08-30T08:00:00Z","description":"调价测试入库"
                                }
                                """.formatted(requestCode, requestCode, fixture.itemId(), fixture.binId(), lotId, quantity)))
                .andExpect(status().isCreated());
    }

    private String createLot(String itemId, String lotNo) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-items/{id}/lots", itemId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lotNo":"%s","productionDate":"2026-01-01","expiryDate":"2027-12-31",
                                 "manufacturerNameSnapshot":"示例制药企业","qualityStatus":"QUALIFIED"}
                                """.formatted(lotNo)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    private Fixture createFixture(String suffix) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"PA-%s",
                                 "name":"调价测试药房%s","siteType":"PHARMACY","serviceScope":"OUTPATIENT",
                                 "validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-items", site.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                 "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                 "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false}
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-bins", site.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"PA-A","name":"调价货位","binType":"BIN","stockDefault":"AVAILABLE",
                                 "receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":1}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Fixture(site.get("id").asText(), item.get("id").asText(), bin.get("id").asText());
    }

    private record Fixture(String siteId, String itemId, String binId) {}
}
