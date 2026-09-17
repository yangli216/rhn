package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ResetDatabaseBeforeEachTestMethod
class InventoryPeriodCloseWorkflowTest extends RhnIntegrationTestSupport {
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";

    @Test
    void preview_detects_stale_state_and_post_rolls_forward_next_period() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        Fixture fixture = createFixture(suffix);
        String lotId = createLot(fixture.itemId(), "MC-" + suffix);
        receive("MC-R1-" + suffix, fixture, lotId, "2", "2026-08-27T08:00:00Z");
        JsonNode period = period(fixture.siteId(), "202608");

        JsonNode first = prepare(period.get("id").asString(), "MC-CLOSE-1-" + suffix);
        assertEquals("VALIDATED", first.get("status").asString());
        assertEquals(0, first.get("differenceCount").asInt());
        assertEquals(1, first.get("dimensionCount").asInt());
        assertEquals(0, first.at("/totals/0/valueDifference").decimalValue().signum());
        assertEquals(0, differences(first.get("id").asString()).size());

        receive("MC-R2-" + suffix, fixture, lotId, "1", "2026-08-28T08:00:00Z");
        mockMvc.perform(post("/api/pharmacy/inventory-periods/close-runs/{id}/post",
                        first.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVENTORY_CLOSE_STALE"));

        JsonNode second = prepare(period.get("id").asString(), "MC-CLOSE-2-" + suffix);
        mockMvc.perform(post("/api/pharmacy/inventory-periods/close-runs/{id}/post",
                        second.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.differenceCount").value(0));

        mockMvc.perform(get("/api/pharmacy/inventory-periods").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].periodCode").value("202609"))
                .andExpect(jsonPath("$[0].status").value("OPEN"))
                .andExpect(jsonPath("$[0].previousPeriodId").value(period.get("id").asString()))
                .andExpect(jsonPath("$[1].periodCode").value("202608"))
                .andExpect(jsonPath("$[1].status").value("CLOSED"))
                .andExpect(jsonPath("$[1].closingRunId").value(second.get("id").asString()));

        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(receiptBody("MC-LATE-" + suffix, fixture, lotId, "1",
                                "2026-08-29T08:00:00Z")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVENTORY_PERIOD_NOT_OPEN"));
        receive("MC-NEXT-" + suffix, fixture, lotId, "1", "2026-09-01T08:00:00Z");
    }

    private JsonNode prepare(String periodId, String requestCode) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/inventory-periods/{id}/close-runs", periodId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"%s\",\"currencyCode\":\"CNY\"}".formatted(requestCode)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode differences(String closeRunId) throws Exception {
        return json(mockMvc.perform(get("/api/pharmacy/inventory-periods/close-runs/{id}/differences", closeRunId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode period(String siteId, String code) throws Exception {
        JsonNode values = json(mockMvc.perform(get("/api/pharmacy/inventory-periods").with(rhnWorkContext())
                        .queryParam("stockSiteId", siteId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (JsonNode value : values) if (code.equals(value.get("periodCode").asString())) return value;
        throw new AssertionError("Missing inventory period " + code);
    }

    private void receive(String requestCode, Fixture fixture, String lotId, String quantity,
                         String occurredAt) throws Exception {
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(receiptBody(requestCode, fixture, lotId, quantity, occurredAt)))
                .andExpect(status().isCreated());
    }

    private String receiptBody(String requestCode, Fixture fixture, String lotId, String quantity,
                               String occurredAt) {
        return """
                {
                  "requestCode":"%s","sourceCode":"%s","stockItemId":"%s",
                  "stockBinId":"%s","stockLotId":"%s","operationQuantity":%s,
                  "unitCost":8.50,"occurredAt":"%s","description":"月结测试入库"
                }
                """.formatted(requestCode, requestCode, fixture.itemId(), fixture.binId(), lotId,
                quantity, occurredAt);
    }

    private String createLot(String itemId, String lotNo) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-items/{id}/lots", itemId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "lotNo":"%s","productionDate":"2026-01-01","expiryDate":"2027-12-31",
                                  "manufacturerNameSnapshot":"示例制药企业","qualityStatus":"QUALIFIED"
                                }
                                """.formatted(lotNo)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }

    private Fixture createFixture(String suffix) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","departmentId":"%s","code":"MC-%s",
                                  "name":"月结测试药房%s","siteType":"PHARMACY","serviceScope":"OUTPATIENT",
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-items",
                                site.get("id").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                  "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                  "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-bins",
                                site.get("id").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"MC-A","name":"月结货位","binType":"BIN","stockDefault":"AVAILABLE",
                                  "receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":1
                                }
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Fixture(site.get("id").asString(), item.get("id").asString(), bin.get("id").asString());
    }

    private record Fixture(String siteId, String itemId, String binId) {}
}
