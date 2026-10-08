package com.rhn;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
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
    @Autowired JdbcTemplate jdbc;

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

    @ParameterizedTest
    @ValueSource(strings = {"USD", "EUR"})
    void preview_rejects_relabeling_cny_cost_as_foreign_currency(String currency) throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("CURRENCY-" + suffix, fixture, createLot(fixture.itemId(), suffix), "1", "2026-08-27T08:00:00Z");
        String periodId = period(fixture.siteId(), "202608").get("id").asString();
        mockMvc.perform(post("/api/pharmacy/inventory-periods/{id}/close-runs", periodId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"FX-%s\",\"currencyCode\":\"%s\"}".formatted(suffix, currency)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVENTORY_COST_CURRENCY_UNSUPPORTED"));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_SUP_INV_PERIOD_CLOSE_RUN where ID_INV_PERIOD = ?",
                Integer.class, Long.valueOf(periodId)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "amount", "currency"})
    void posting_requires_actual_matching_cost_total(String problem) throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("TOTAL-" + suffix, fixture, createLot(fixture.itemId(), suffix), "1", "2026-08-27T08:00:00Z");
        String periodId = period(fixture.siteId(), "202608").get("id").asString();
        String runId = prepare(periodId, "TOTAL-CLOSE-" + suffix).get("id").asString();
        if (problem.equals("missing")) {
            jdbc.update("delete from RHN_SUP_INV_PERIOD_CLOSE_TOTAL where ID_INV_PERIOD_CLOSE_RUN = ?", Long.valueOf(runId));
        } else if (problem.equals("amount")) {
            jdbc.update("update RHN_SUP_INV_PERIOD_CLOSE_TOTAL set AMT_MVMT = AMT_MVMT + 1, AMT_CLOSE = AMT_CLOSE + 1, AMT_BAL = AMT_BAL + 1 where ID_INV_PERIOD_CLOSE_RUN = ?", Long.valueOf(runId));
        } else {
            jdbc.update("update RHN_SUP_INV_PERIOD_CLOSE_TOTAL set CD_CCY = 'USD' where ID_INV_PERIOD_CLOSE_RUN = ?", Long.valueOf(runId));
        }
        mockMvc.perform(post("/api/pharmacy/inventory-periods/close-runs/{id}/post", runId).with(rhnWorkContext()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(problem.equals("currency")
                        ? "INVENTORY_COST_CURRENCY_UNSUPPORTED" : "INVENTORY_CLOSE_TOTAL_INVALID"));
        assertEquals("OPEN", period(fixture.siteId(), "202608").get("status").asString());
        assertEquals("VALIDATED", jdbc.queryForObject("select SD_STATUS from RHN_SUP_INV_PERIOD_CLOSE_RUN where ID_INV_PERIOD_CLOSE_RUN = ?",
                String.class, Long.valueOf(runId)));
    }

    @Test
    void actual_zero_cost_can_close_and_retry_without_fabricated_amounts() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(receiptBody("FREE-" + suffix, fixture, createLot(fixture.itemId(), suffix), "1", "2026-08-27T08:00:00Z")
                                .replace("8.50", "0")))
                .andExpect(status().isCreated());
        JsonNode preview = prepare(period(fixture.siteId(), "202608").get("id").asString(), "FREE-CLOSE-" + suffix);
        assertEquals(0, preview.get("differenceCount").asInt());
        for (int attempt = 0; attempt < 2; attempt++) {
            mockMvc.perform(post("/api/pharmacy/inventory-periods/close-runs/{id}/post", preview.get("id").asString())
                            .with(rhnWorkContext())).andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("POSTED"))
                    .andExpect(jsonPath("$.totals[0].closingValue").value(0));
        }
    }

    @Test
    void posting_detects_loss_of_zero_cost_evidence() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        String lotId = createLot(fixture.itemId(), suffix);
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(receiptBody("ZERO-" + suffix, fixture, lotId, "1", "2026-08-27T08:00:00Z")
                                .replace("8.50", "0")))
                .andExpect(status().isCreated());
        String periodId = period(fixture.siteId(), "202608").get("id").asString();
        String runId = prepare(periodId, "ZERO-CLOSE-" + suffix).get("id").asString();
        jdbc.update("update RHN_SUP_INV_TXN_LINE set AMT_DELTA = null, PRICE_UNIT_COST = null where ID_STOCK_SITE = ?",
                Long.valueOf(fixture.siteId()));
        mockMvc.perform(post("/api/pharmacy/inventory-periods/close-runs/{id}/post", runId).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVENTORY_CLOSE_STALE"));
        JsonNode fresh = prepare(periodId, "ZERO-FRESH-" + suffix);
        assertEquals(1, fresh.get("differenceCount").asInt());
        mockMvc.perform(post("/api/pharmacy/inventory-periods/close-runs/{id}/post", fresh.get("id").asString())
                        .with(rhnWorkContext())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVENTORY_CLOSE_HAS_DIFFERENCES"));
    }

    @Test
    void next_period_rejects_foreign_currency_opening_snapshot() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("OPENING-" + suffix, fixture, createLot(fixture.itemId(), suffix), "1", "2026-08-27T08:00:00Z");
        String runId = prepare(period(fixture.siteId(), "202608").get("id").asString(), "OPENING-CLOSE-" + suffix).get("id").asString();
        mockMvc.perform(post("/api/pharmacy/inventory-periods/close-runs/{id}/post", runId).with(rhnWorkContext()))
                .andExpect(status().isOk());
        jdbc.update("""
                update RHN_SUP_INV_PERIOD_BAL_VAL set CD_CCY = 'USD' where ID_INV_PERIOD_BAL_SNAP in
                (select ID_INV_PERIOD_BAL_SNAP from RHN_SUP_INV_PERIOD_BAL_SNAP where ID_INV_PERIOD_CLOSE_RUN = ?)
                """, Long.valueOf(runId));
        mockMvc.perform(post("/api/pharmacy/inventory-periods/{id}/close-runs", period(fixture.siteId(), "202609").get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"NEXT-%s\",\"currencyCode\":\"CNY\"}".formatted(suffix)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVENTORY_COST_CURRENCY_UNSUPPORTED"));
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
