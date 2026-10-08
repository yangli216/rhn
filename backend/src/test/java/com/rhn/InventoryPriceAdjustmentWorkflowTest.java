package com.rhn;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.PackageSnapshot;
import com.rhn.platform.masterdata.api.MasterDataViews.PriceView;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.doReturn;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ResetDatabaseBeforeEachTestMethod
class InventoryPriceAdjustmentWorkflowTest extends RhnIntegrationTestSupport {
    private static final String PRODUCT_ID = "362387869795113";
    private static final String PACKAGE_ID = "362387869795403";

    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean CatalogLifecycleDirectory catalog;

    @Test
    void cost_revalue_rejects_stale_preview_and_enters_period_value_ledger() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        Fixture fixture = createFixture(suffix); String lotId = createLot(fixture.itemId(), "PA-" + suffix);
        receive("PA-R1-" + suffix, fixture, lotId, "2");

        JsonNode stale = createAdjustment(fixture, "PA-STALE-" + suffix, "10.00");
        submitApprove(stale.get("id").asString());
        receive("PA-R2-" + suffix, fixture, lotId, "1");
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", stale.get("id").asString())
                        .with(rhnWorkContext()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRICE_ADJUSTMENT_PREVIEW_STALE"));

        JsonNode current = createAdjustment(fixture, "PA-CURRENT-" + suffix, "10.50");
        JsonNode submitted = submitApprove(current.get("id").asString());
        assertEquals(0, submitted.get("totalAdjustmentAmount").decimalValue().compareTo(new BigDecimal("84.000000")));
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", current.get("id").asString())
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
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SUP_INV_VALUAT_ENTRY where ID_SRC = ?",
                Integer.class, Long.valueOf(current.get("id").asString())));

        JsonNode period = periods(fixture.siteId()).get(0);
        JsonNode close = json(mockMvc.perform(post("/api/pharmacy/inventory-periods/{id}/close-runs", period.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"PA-CLOSE-%s\",\"currencyCode\":\"CNY\"}".formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(0, close.at("/totals/0/movementAmount").decimalValue().compareTo(new BigDecimal("357.000000")));
        assertEquals(0, close.at("/totals/0/valuationAdjustmentAmount").decimalValue().compareTo(new BigDecimal("84.000000")));
        assertEquals(0, close.at("/totals/0/closingValue").decimalValue().compareTo(new BigDecimal("441.000000")));
        assertEquals(0, close.get("differenceCount").asInt());
    }

    @ParameterizedTest
    @CsvSource({"1,28,56", "14,28,56", "14,0,0"})
    void sale_adjustment_uses_actual_package_factor_and_preserves_explicit_zero(
            String factor, String newPrice, String totalAfter) throws Exception {
        jdbc.update("update RHN_BD_ITEM_PKG set QTY_FACTOR = ? where ID_ITEM_PKG = ?",
                new BigDecimal(factor), Long.valueOf(PACKAGE_ID));
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("SALE-RECEIVE-" + suffix, fixture, createLot(fixture.itemId(), "SALE-" + suffix), "2");
        JsonNode draft = createSaleAdjustment(fixture, "SALE-" + suffix, newPrice);
        String id = draft.get("id").asString();
        JsonNode approved = submitApprove(id);
        assertEquals(0, approved.get("totalValueBefore").decimalValue().compareTo(new BigDecimal("37.2")));
        assertEquals(0, approved.get("totalValueAfter").decimalValue().compareTo(new BigDecimal(totalAfter)));
        assertEquals(0, approved.at("/lines/0/quantitySnapshot").decimalValue()
                .compareTo(new BigDecimal(factor).multiply(new BigDecimal("2"))));
        JsonNode posted = json(mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", id)
                        .with(rhnWorkContext())).andDo(result -> {
                    if (result.getResolvedException() != null) throw new AssertionError("Sales posting failed", result.getResolvedException());
                }).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.lines[0].newCatalogPriceId").isNotEmpty())
                .andReturn().getResponse().getContentAsString());
        assertEquals(0, posted.get("totalAdjustmentAmount").decimalValue()
                .compareTo(new BigDecimal(totalAfter).subtract(new BigDecimal("37.2"))));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_SUP_INV_VALUAT_ENTRY where ID_SRC = ? and SD_VALUAT_BASIS = 'RETAIL'",
                Integer.class, Long.valueOf(id)));
        assertEquals(0, jdbc.queryForObject("select PRICE_UNIT from RHN_BD_CATALOG_PRICE where ID_CATALOG_PRICE = ?",
                BigDecimal.class, Long.valueOf(posted.at("/lines/0/newCatalogPriceId").asString())).compareTo(new BigDecimal(newPrice)));
        JsonNode balances = json(mockMvc.perform(get("/api/pharmacy/inventory/balances").with(rhnWorkContext())
                        .queryParam("stockSiteId", fixture.siteId()).queryParam("stockItemId", fixture.itemId()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(0, balances.get(0).get("quantityOnHand").decimalValue()
                .compareTo(new BigDecimal(factor).multiply(new BigDecimal("2"))));
        assertEquals(0, balances.get(0).get("averageUnitCost").decimalValue().compareTo(new BigDecimal("8.5")));
    }

    @ParameterizedTest
    @CsvSource({
            "snapshot,PRICE_ADJUSTMENT_PACKAGE_INVALID", "package,PRICE_ADJUSTMENT_PACKAGE_INVALID",
            "factor,PRICE_ADJUSTMENT_PACKAGE_INVALID", "zero,PRICE_ADJUSTMENT_PACKAGE_INVALID",
            "negative,PRICE_ADJUSTMENT_PACKAGE_INVALID", "packageId,PRICE_ADJUSTMENT_PACKAGE_INVALID",
            "price,PRICE_ADJUSTMENT_CURRENT_PRICE_MISSING", "priceAmount,PRICE_ADJUSTMENT_CURRENT_PRICE_MISSING",
            "negativePrice,PRICE_ADJUSTMENT_CURRENT_PRICE_MISSING",
            "pricePackage,PRICE_ADJUSTMENT_PRICE_PACKAGE_MISMATCH",
            "currency,PRICE_ADJUSTMENT_CURRENCY_MISMATCH", "missingCurrency,PRICE_ADJUSTMENT_CURRENCY_MISMATCH"
    })
    void sale_preview_rejects_incomplete_or_incompatible_pricing(String problem, String code) throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("INVALID-RECEIVE-" + suffix, fixture, createLot(fixture.itemId(), "INVALID-" + suffix), "2");
        String id = createSaleAdjustment(fixture, "INVALID-" + suffix, "28").get("id").asString();
        CatalogOperationalSnapshot actual = saleSnapshot();
        PackageSnapshot itemPackage = actual.itemPackage();
        BigDecimal factor = switch (problem) {
            case "factor" -> null;
            case "zero" -> BigDecimal.ZERO;
            case "negative" -> BigDecimal.ONE.negate();
            default -> itemPackage.quantityFactor();
        };
        itemPackage = new PackageSnapshot(problem.equals("packageId") ? -1L : itemPackage.id(), itemPackage.unitCode(),
                itemPackage.unitName(), itemPackage.packageSpec(), factor, itemPackage.usageType(), itemPackage.status(),
                itemPackage.validFrom(), itemPackage.validTo());
        PriceView actualPrice = actual.price();
        PriceView price = new PriceView(actualPrice.id(), actualPrice.revision(), actualPrice.organizationId(),
                problem.equals("pricePackage") ? null : actualPrice.packageId(), actualPrice.sdPriceType(),
                problem.equals("priceAmount") ? null : problem.equals("negativePrice") ? BigDecimal.ONE.negate() : actualPrice.price(),
                problem.equals("currency") ? "USD" : problem.equals("missingCurrency") ? null : actualPrice.currencyCode(),
                actualPrice.priceDocumentCode(), actualPrice.priceReason(), actualPrice.validFrom(), actualPrice.validTo(),
                actualPrice.sdStatus(), actualPrice.replacesPriceId());
        CatalogOperationalSnapshot incomplete = new CatalogOperationalSnapshot(actual.catalogItemId(), actual.organizationId(),
                actual.packageId(), actual.priceType(), actual.businessDate(), actual.item(),
                problem.equals("package") ? null : itemPackage, actual.medication(), actual.adoption(), problem.equals("price") ? null : price);
        stubSaleSnapshot(problem.equals("snapshot") ? null : incomplete);
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/submit", id).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value(code));
        assertUnposted(id, "DRAFT");
        mockMvc.perform(get("/api/pharmacy/inventory-price-adjustments/{id}", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.lines[0].lineStatus").value("PENDING"))
                .andExpect(jsonPath("$.lines[0].details.length()").value(0));
    }

    @Test
    void sale_post_rejects_changed_package_conversion_and_rolls_back_price_replacement() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("STALE-SALE-RECEIVE-" + suffix, fixture, createLot(fixture.itemId(), "STALE-SALE-" + suffix), "2");
        String id = createSaleAdjustment(fixture, "STALE-SALE-" + suffix, "28").get("id").asString();
        submitApprove(id);
        jdbc.update("update RHN_BD_ITEM_PKG set QTY_FACTOR = 7 where ID_ITEM_PKG = ?", Long.valueOf(PACKAGE_ID));
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", id).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRICE_ADJUSTMENT_PACKAGE_STALE"));
        assertUnposted(id, "APPROVED");
        jdbc.update("update RHN_BD_ITEM_PKG set QTY_FACTOR = 14 where ID_ITEM_PKG = ?", Long.valueOf(PACKAGE_ID));
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("POSTED"));
    }

    @Test
    void sale_post_rechecks_required_pricing_data() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("MISSING-SALE-RECEIVE-" + suffix, fixture, createLot(fixture.itemId(), "MISSING-SALE-" + suffix), "2");
        String id = createSaleAdjustment(fixture, "MISSING-SALE-" + suffix, "28").get("id").asString();
        submitApprove(id);
        stubSaleSnapshot(null);
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", id).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRICE_ADJUSTMENT_PACKAGE_INVALID"));
        assertUnposted(id, "APPROVED");
    }

    @ParameterizedTest
    @CsvSource({"COST_REVALUE,true", "SALE_PRICE,true", "SALE_PRICE,false"})
    void newly_received_lot_invalidates_the_complete_valuation_snapshot(String type, boolean initialStock) throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        if (initialStock) receive("SCOPE-INITIAL-" + suffix, fixture, createLot(fixture.itemId(), "SCOPE-A-" + suffix), "2");
        JsonNode stale = type.equals("COST_REVALUE")
                ? createAdjustment(fixture, "SCOPE-STALE-" + suffix, "10.50")
                : createSaleAdjustment(fixture, "SCOPE-STALE-" + suffix, "28");
        String id = stale.get("id").asString();
        JsonNode preview = submitApprove(id);
        int oldDimensionCount = preview.at("/lines/0/details").size();
        receive("SCOPE-NEW-" + suffix, fixture, createLot(fixture.itemId(), "SCOPE-B-" + suffix), "1");
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", id).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PRICE_ADJUSTMENT_PREVIEW_STALE"));
        assertUnposted(id, "APPROVED");
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_SUP_INV_BAL where ID_STOCK_ITEM = ? and PRICE_AVERAGE_UNIT_COST <> 8.5",
                Integer.class, Long.valueOf(fixture.itemId())));
        JsonNode fresh = type.equals("COST_REVALUE")
                ? createAdjustment(fixture, "SCOPE-FRESH-" + suffix, "10.50")
                : createSaleAdjustment(fixture, "SCOPE-FRESH-" + suffix, "28");
        String freshId = fresh.get("id").asString();
        JsonNode freshPreview = submitApprove(freshId);
        assertEquals(oldDimensionCount + 1, freshPreview.at("/lines/0/details").size());
        assertEquals(0, freshPreview.at("/lines/0/quantitySnapshot").decimalValue()
                .compareTo(new BigDecimal(initialStock ? "42" : "14")));
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", freshId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.lines[0].details.length()").value(oldDimensionCount + 1));
        assertEquals(oldDimensionCount + 1, jdbc.queryForObject("select count(*) from RHN_SUP_INV_VALUAT_ENTRY where ID_SRC = ?",
                Integer.class, Long.valueOf(freshId)));
    }

    @Test
    void new_stock_for_an_unselected_item_does_not_invalidate_the_adjustment() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("UNRELATED-INITIAL-" + suffix, fixture, createLot(fixture.itemId(), "UNRELATED-A-" + suffix), "2");
        String id = createAdjustment(fixture, "UNRELATED-" + suffix, "10.50").get("id").asString();
        submitApprove(id);
        String otherItem = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-items", fixture.siteId())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"362387869795111","packageId":"362387869795401","issuePolicy":"FEFO",
                                 "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                 "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        Fixture other = new Fixture(fixture.siteId(), otherItem, fixture.binId());
        receive("UNRELATED-NEW-" + suffix, other, createLot(otherItem, "UNRELATED-B-" + suffix), "1");
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.lines[0].details.length()").value(1));
        assertEquals(0, jdbc.queryForObject("select PRICE_AVERAGE_UNIT_COST from RHN_SUP_INV_BAL where ID_STOCK_ITEM = ?",
                BigDecimal.class, Long.valueOf(otherItem)).compareTo(new BigDecimal("8.5")));
    }

    private CatalogOperationalSnapshot saleSnapshot() {
        return catalog.resolve(Long.valueOf(TENANT), Long.valueOf(PRODUCT_ID), Long.valueOf(ORGANIZATION),
                Long.valueOf(PACKAGE_ID), "SALE", LocalDate.parse("2026-08-30"));
    }

    private void stubSaleSnapshot(CatalogOperationalSnapshot snapshot) {
        doReturn(snapshot).when(catalog).resolve(Long.valueOf(TENANT), Long.valueOf(PRODUCT_ID), Long.valueOf(ORGANIZATION),
                Long.valueOf(PACKAGE_ID), "SALE", LocalDate.parse("2026-08-30"));
    }

    private void assertUnposted(String id, String expectedStatus) {
        assertEquals(expectedStatus, jdbc.queryForObject("select SD_STATUS from RHN_SUP_INV_PRICE_ADJ where ID_INV_PRICE_ADJ = ?",
                String.class, Long.valueOf(id)));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_SUP_INV_VALUAT_ENTRY where ID_SRC = ?",
                Integer.class, Long.valueOf(id)));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_SUP_INV_PRICE_ADJ_LINE where ID_INV_PRICE_ADJ = ? and ID_CATALOG_PRICE_NEW is not null",
                Integer.class, Long.valueOf(id)));
        assertEquals(0, jdbc.queryForObject("select PRICE_UNIT from RHN_BD_CATALOG_PRICE where ID_CATALOG_PRICE = 362387869795613",
                BigDecimal.class).compareTo(new BigDecimal("18.6")));
        assertEquals("ACTIVE", jdbc.queryForObject("select SD_STATUS from RHN_BD_CATALOG_PRICE where ID_CATALOG_PRICE = 362387869795613", String.class));
    }

    private JsonNode createSaleAdjustment(Fixture fixture, String requestCode, String newPrice) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"stockSiteId":"%s","requestCode":"%s","adjustmentType":"SALE_PRICE","priceType":"SALE",
                                 "businessDate":"2026-08-30","currencyCode":"CNY","reason":"测试销售调价",
                                 "lines":[{"stockItemId":"%s","newSalePrice":%s}]}
                                """.formatted(fixture.siteId(), requestCode, fixture.itemId(), newPrice)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void cost_adjustment_rejects_foreign_currency_before_creation() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"stockSiteId":"%s","requestCode":"FX-%s","adjustmentType":"COST_REVALUE",
                                 "businessDate":"2026-08-30","currencyCode":"USD","reason":"测试外币成本",
                                 "lines":[{"stockItemId":"%s","newUnitCost":10}]}
                                """.formatted(fixture.siteId(), suffix, fixture.itemId())))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVENTORY_COST_CURRENCY_UNSUPPORTED"));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_SUP_INV_PRICE_ADJ where ID_STOCK_SITE = ?",
                Integer.class, Long.valueOf(fixture.siteId())));
    }

    @Test
    void legacy_foreign_currency_cost_document_cannot_post() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("FX-R-" + suffix, fixture, createLot(fixture.itemId(), suffix), "1");
        String id = createAdjustment(fixture, "FX-OLD-" + suffix, "10.50").get("id").asString();
        submitApprove(id);
        jdbc.update("update RHN_SUP_INV_PRICE_ADJ set CD_CCY = 'USD' where ID_INV_PRICE_ADJ = ?", Long.valueOf(id));
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", id).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVENTORY_COST_CURRENCY_UNSUPPORTED"));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_SUP_INV_VALUAT_ENTRY where ID_SRC = ?",
                Integer.class, Long.valueOf(id)));
    }

    @Test
    void period_close_rejects_foreign_cost_movement_even_after_preview() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Fixture fixture = createFixture(suffix);
        receive("FX-SOURCE-" + suffix, fixture, createLot(fixture.itemId(), suffix), "1");
        String id = createAdjustment(fixture, "FX-SOURCE-ADJ-" + suffix, "10.50").get("id").asString();
        submitApprove(id);
        mockMvc.perform(post("/api/pharmacy/inventory-price-adjustments/{id}/post", id).with(rhnWorkContext()))
                .andExpect(status().isOk());
        String periodId = periods(fixture.siteId()).get(0).get("id").asString();
        String runId = json(mockMvc.perform(post("/api/pharmacy/inventory-periods/{id}/close-runs", periodId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"FX-PREVIEW-%s\",\"currencyCode\":\"CNY\"}".formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
        jdbc.update("update RHN_SUP_INV_VALUAT_ENTRY set CD_CCY = 'USD' where ID_SRC = ?", Long.valueOf(id));
        mockMvc.perform(post("/api/pharmacy/inventory-periods/close-runs/{id}/post", runId).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVENTORY_COST_CURRENCY_UNSUPPORTED"));
        mockMvc.perform(post("/api/pharmacy/inventory-periods/{id}/close-runs", periodId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"FX-NEW-%s\",\"currencyCode\":\"CNY\"}".formatted(suffix)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVENTORY_COST_CURRENCY_UNSUPPORTED"));
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
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }

    private Fixture createFixture(String suffix) throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"PA-%s",
                                 "name":"调价测试药房%s","siteType":"PHARMACY","serviceScope":"OUTPATIENT",
                                 "validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-items", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                 "negativeAllowed":false,"lotRequired":true,"traceRequired":false,
                                 "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false}
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-bins", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"PA-A","name":"调价货位","binType":"BIN","stockDefault":"AVAILABLE",
                                 "receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":1}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Fixture(site.get("id").asString(), item.get("id").asString(), bin.get("id").asString());
    }

    private record Fixture(String siteId, String itemId, String binId) {}
}
