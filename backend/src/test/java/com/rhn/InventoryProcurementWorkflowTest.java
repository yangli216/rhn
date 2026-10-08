package com.rhn;

import com.rhn.pharmacy.domain.InventorySplitEvent;
import com.rhn.pharmacy.infrastructure.InventorySplitEventRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.util.UUID;
import java.util.List;
import java.math.BigDecimal;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ResetDatabaseBeforeEachTestMethod
class InventoryProcurementWorkflowTest extends RhnIntegrationTestSupport {
    private static final String PRODUCT_1 = "362387869795111";
    private static final String PACKAGE_1 = "362387869795401";
    private static final String PRODUCT_2 = "362387869795112";
    private static final String PACKAGE_2 = "362387869795402";

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired InventorySplitEventRepository splitEventRepository;

    @Test
    void purchase_arrival_inspection_and_batch_post_are_traceable_and_idempotent() throws Exception {
        Fixture fixture = createFixture("HAPPY");
        JsonNode supplier = createSupplier(fixture.suffix());
        configureSupply(supplier, PRODUCT_1, PACKAGE_1, "12.80");
        configureSupply(supplier, PRODUCT_2, PACKAGE_2, "6.50");
        JsonNode order = createApprovedOrder(fixture, supplier);

        JsonNode receipt = createReceipt(fixture, order, "GR-HAPPY-" + fixture.suffix());
        String receiptId = receipt.get("id").asString();
        String receiptLine1 = receipt.at("/lines/0/id").asString();
        String receiptLine2 = receipt.at("/lines/1/id").asString();
        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/inspect", receiptId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"description":"逐项验收并记录拒收原因","lines":[
                                  {"goodsReceiptLineId":"%s","acceptedQuantity":1,"rejectedQuantity":1,
                                   "rejectionReason":"外包装破损"},
                                  {"goodsReceiptLineId":"%s","acceptedQuantity":2,"rejectedQuantity":1,
                                   "rejectionReason":"配送数量与票据不符"}
                ]}
                                """.formatted(receiptLine1, receiptLine2)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PARTIALLY_ACCEPTED"));
        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/post", receiptId).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TRACE_REGISTRATION_INCOMPLETE"));
        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/trace-codes", receiptId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lines":[
                                  {"goodsReceiptLineId":"%s","traceCodes":["UNIQUE-%s"]},
                                  {"goodsReceiptLineId":"%s","traceCodes":["DUP-%s","DUP-%s"]}
                                ]}
                                """.formatted(receiptLine1, fixture.suffix(), receiptLine2,
                                fixture.suffix(), fixture.suffix())))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TRACE_CODE_DUPLICATE"));
        registerTraceCodes(receiptId, receiptLine1, List.of("TRACE-A-" + fixture.suffix()),
                receiptLine2, List.of("TRACE-B1-" + fixture.suffix(), "TRACE-B2-" + fixture.suffix()));

        JsonNode posted = json(mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/post", receiptId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.lines[0].inventoryTransactionId").isNotEmpty())
                .andExpect(jsonPath("$.lines[1].inventoryTransactionId").isNotEmpty())
                .andReturn().getResponse().getContentAsString());
        String transaction1 = posted.at("/lines/0/inventoryTransactionId").asString();
        assertCost(fixture.item1Id(), transaction1, "0.533333", "12.80");
        assertCost(fixture.item2Id(), transaction1, "0.325000", "13.00");
        assertCloseValues(fixture.siteId(), "25.80", "-0.000008", "25.799992");

        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/post", receiptId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.lines[0].inventoryTransactionId").value(transaction1));
        mockMvc.perform(get("/api/pharmacy/inventory/transactions").with(rhnWorkContext())
                        .param("stockSiteId", fixture.siteId())
                        .param("stockItemId", fixture.item1Id())
                        .param("allPeriods", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.sourceType == 'GOODS_RECEIPT')].sourceCode")
                        .value(receipt.get("receiptNo").asString()));
        mockMvc.perform(get("/api/pharmacy/inventory-documents/GOODS_RECEIPT/{id}/events", receiptId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].eventType").value("RECEIVED"))
                .andExpect(jsonPath("$[1].eventType").value("INSPECTED"))
                .andExpect(jsonPath("$[2].eventType").value("POSTED"));

        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from RHN_SUP_INV_TXN " +
                "where SD_SRC_TYPE = 'GOODS_RECEIPT' and CD_SRC = ?", Integer.class,
                receipt.get("receiptNo").asString()));
        assertEquals(24, jdbcTemplate.queryForObject("select sum(QTY_ON_HAND) from RHN_SUP_INV_BAL " +
                "where ID_STOCK_ITEM = ?", Integer.class, Long.valueOf(fixture.item1Id())));
        assertEquals(40, jdbcTemplate.queryForObject("select sum(QTY_ON_HAND) from RHN_SUP_INV_BAL " +
                "where ID_STOCK_ITEM = ?", Integer.class, Long.valueOf(fixture.item2Id())));
        mockMvc.perform(get("/api/pharmacy/inventory/trace-codes").with(rhnWorkContext())
                        .param("stockSiteId", fixture.siteId()).param("query", "TRACE-B"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].status").value("AVAILABLE"));
        JsonNode traceA = json(mockMvc.perform(get("/api/pharmacy/inventory/trace-codes").with(rhnWorkContext())
                        .param("stockSiteId", fixture.siteId()).param("query", "TRACE-A"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andReturn().getResponse().getContentAsString()).get(0);
        mockMvc.perform(post("/api/pharmacy/dispense/trace-codes/scan").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"stockSiteId":"%s","traceCodes":["%s","%s","NOT-FOUND-%s"]}
                                """.formatted(fixture.siteId(), traceA.get("traceCode").asString(),
                                "TRACE-B1-" + fixture.suffix(), fixture.suffix())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.codes.length()").value(2))
                .andExpect(jsonPath("$.codes[0].traceCode").value(traceA.get("traceCode").asString()))
                .andExpect(jsonPath("$.codes[1].traceCode").value("TRACE-B1-" + fixture.suffix()))
                .andExpect(jsonPath("$.notFoundCodes[0]").value("NOT-FOUND-" + fixture.suffix()));
        JsonNode opened = json(mockMvc.perform(post("/api/pharmacy/inventory/open-packages").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"OPEN-TRACE-%s","stockSiteId":"%s","stockBinId":"%s",
                                 "stockItemId":"%s","stockLotId":"%s","occurredAt":"2026-08-29T00:00:00Z"}
                                """.formatted(fixture.suffix(), fixture.siteId(), fixture.bin1Id(),
                                fixture.item1Id(), traceA.get("stockLotId").asString())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.traceCodeId").value(traceA.get("id").asString()))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/pharmacy/inventory/trace-codes/{id}", traceA.get("id").asString())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code.status").value("OPENED"))
                .andExpect(jsonPath("$.code.remainingBaseQuantity").value(24))
                .andExpect(jsonPath("$.events[1].eventType").value("SPLIT_OPEN"))
                .andExpect(jsonPath("$.events[1].balanceAfter").value(24));
        assertEquals(traceA.get("id").asString(), opened.get("traceCodeId").asString());
        Long sourceDispenseId = 88001L;
        splitEventRepository.saveAndFlush(new InventorySplitEvent(Long.valueOf(TENANT),
                opened.get("id").asLong(), "CONSUME", "MEDICATION_DISPENSE", sourceDispenseId,
                "DSP-QUERY-CHECK", new BigDecimal("-5"), new BigDecimal("19"), Instant.now(),
                1L, "校验原发药拆零归属查询"));
        assertEquals(List.of(opened.get("id").asLong()), splitEventRepository.findConsumedPackageIds(
                Long.valueOf(TENANT), sourceDispenseId));
        assertEquals(0, splitEventRepository.sumConsumed(Long.valueOf(TENANT), opened.get("id").asLong(),
                sourceDispenseId).compareTo(new BigDecimal("5")));
        mockMvc.perform(post("/api/pharmacy/inventory/reconciliations").with(rhnWorkContext())
                        .param("stockSiteId", fixture.siteId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PASSED"))
                .andExpect(jsonPath("$.dimensionCount").value(2))
                .andExpect(jsonPath("$.issueCount").value(0));
    }

    @Test
    void batch_post_rolls_back_every_line_when_one_destination_becomes_invalid() throws Exception {
        Fixture fixture = createFixture("ROLLBACK"); JsonNode supplier = createSupplier(fixture.suffix());
        configureSupply(supplier, PRODUCT_1, PACKAGE_1, "12.80");
        configureSupply(supplier, PRODUCT_2, PACKAGE_2, "6.50");
        JsonNode order = createApprovedOrder(fixture, supplier);
        JsonNode receipt = createReceipt(fixture, order, "GR-ROLLBACK-" + fixture.suffix());
        String receiptId = receipt.get("id").asString();
        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/inspect", receiptId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lines":[
                                  {"goodsReceiptLineId":"%s","acceptedQuantity":2,"rejectedQuantity":0},
                                  {"goodsReceiptLineId":"%s","acceptedQuantity":3,"rejectedQuantity":0}
                                ]}
                                """.formatted(receipt.at("/lines/0/id").asString(), receipt.at("/lines/1/id").asString())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACCEPTED"));
        registerTraceCodes(receiptId, receipt.at("/lines/0/id").asString(),
                List.of("TRACE-R1-" + fixture.suffix(), "TRACE-R2-" + fixture.suffix()),
                receipt.at("/lines/1/id").asString(), List.of("TRACE-R3-" + fixture.suffix(),
                        "TRACE-R4-" + fixture.suffix(), "TRACE-R5-" + fixture.suffix()));
        jdbcTemplate.update("update RHN_SUP_STOCK_BIN set FG_RECEIVE = false where ID_STOCK_BIN = ?", Long.valueOf(fixture.bin2Id()));

        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/post", receiptId).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STOCK_BIN_NOT_RECEIVABLE"));
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from RHN_SUP_INV_TXN " +
                "where SD_SRC_TYPE = 'GOODS_RECEIPT' and CD_SRC = ?", Integer.class,
                receipt.get("receiptNo").asString()));
        assertEquals("ACCEPTED", jdbcTemplate.queryForObject("select SD_STATUS as status from RHN_SUP_GOOD_RCPT where ID_GOOD_RCPT = ?",
                String.class, Long.valueOf(receiptId)));
    }

    private void registerTraceCodes(String receiptId, String line1, List<String> codes1,
                                    String line2, List<String> codes2) throws Exception {
        String payload = objectMapper.writeValueAsString(java.util.Map.of("lines", List.of(
                java.util.Map.of("goodsReceiptLineId", line1, "traceCodes", codes1),
                java.util.Map.of("goodsReceiptLineId", line2, "traceCodes", codes2))));
        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/trace-codes", receiptId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isOk()).andExpect(jsonPath("$.complete").value(true));
    }

    private JsonNode createSupplier(String suffix) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/suppliers").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"SUP-%s","name":"闭环测试供应商%s","unifiedCreditCode":"91310000%s",
                                 "licenseNo":"LIC-%s","licenseValidTo":"2028-12-31","validFrom":"2026-01-01"}
                                """.formatted(suffix, suffix, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private void configureSupply(JsonNode supplier, String productId, String packageId, String price) throws Exception {
        mockMvc.perform(post("/api/pharmacy/suppliers/{id}/supply-items", supplier.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","agreementPrice":%s,
                                 "taxRate":0.13,"validFrom":"2026-01-01"}
                                """.formatted(productId, packageId, price)))
                .andExpect(status().isCreated());
    }

    private JsonNode createApprovedOrder(Fixture fixture, JsonNode supplier) throws Exception {
        JsonNode order = json(mockMvc.perform(post("/api/pharmacy/purchase-orders").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"stockSiteId":"%s","supplierId":"%s","requestCode":"PO-REQ-%s",
                                 "orderDate":"2026-08-28","expectedDate":"2026-08-30","lines":[
                                   {"stockItemId":"%s","packageId":"%s","orderedQuantity":2,"unitPrice":12.80,"taxRate":0.13},
                                   {"stockItemId":"%s","packageId":"%s","orderedQuantity":3,"unitPrice":6.50,"taxRate":0.13}
                                 ]}
                                """.formatted(fixture.siteId(), supplier.get("id").asString(), fixture.suffix(),
                                fixture.item1Id(), PACKAGE_1, fixture.item2Id(), PACKAGE_2)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/purchase-orders/{id}/submit", order.get("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUBMITTED"));
        return json(mockMvc.perform(post("/api/pharmacy/purchase-orders/{id}/approve", order.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"))
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode createReceipt(Fixture fixture, JsonNode order, String requestCode) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/goods-receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"purchaseOrderId":"%s","requestCode":"%s","deliveryNoteNo":"DN-%s",
                                 "receivedAt":"2026-08-28T08:00:00Z","lines":[
                                   {"purchaseOrderLineId":"%s","destinationBinId":"%s","lotNo":"LOT-A-%s",
                                    "productionDate":"2026-06-01","expiryDate":"2028-06-01","deliveredQuantity":2},
                                   {"purchaseOrderLineId":"%s","destinationBinId":"%s","lotNo":"LOT-B-%s",
                                    "productionDate":"2026-06-01","expiryDate":"2028-06-01","deliveredQuantity":3}
                                 ]}
                                """.formatted(order.get("id").asString(), requestCode, fixture.suffix(),
                                order.at("/lines/0/id").asString(), fixture.bin1Id(), fixture.suffix(),
                                order.at("/lines/1/id").asString(), fixture.bin2Id(), fixture.suffix())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("RECEIVED"))
                .andReturn().getResponse().getContentAsString());
    }

    @Test
    void direct_purchase_receipt_flow_creates_order_and_posts_directly() throws Exception {
        Fixture fixture = createFixture("DIRECT", false);
        JsonNode supplier = createSupplier(fixture.suffix());
        String body = """
                {"stockSiteId":"%s","supplierId":"%s","requestCode":"DIR-GR-%s","deliveryNoteNo":"SH-DIR-%s",
                 "receivedAt":"2026-08-28T10:00:00Z","description":"紧急直采入库测试","lines":[
                   {"stockItemId":"%s","packageId":"%s","destinationBinId":"%s","lotNo":"DIR-LOT-A",
                    "productionDate":"2026-06-01","expiryDate":"2028-06-01","quantity":2,"unitPrice":12.80,"taxRate":0.13},
                   {"stockItemId":"%s","packageId":"%s","destinationBinId":"%s","lotNo":"DIR-LOT-B",
                    "productionDate":"2026-06-01","expiryDate":"2028-06-01","quantity":3,"unitPrice":6.50,"taxRate":0.13}
                 ]}
                """.formatted(fixture.siteId(), supplier.get("id").asString(), fixture.suffix(), fixture.suffix(),
                fixture.item1Id(), PACKAGE_1, fixture.bin1Id(), fixture.item2Id(), PACKAGE_2, fixture.bin2Id());

        JsonNode receipt = json(mockMvc.perform(post("/api/pharmacy/direct-goods-receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("POSTED"))
                .andExpect(jsonPath("$.purchaseOrderId").isNotEmpty())
                .andExpect(jsonPath("$.lines.length()").value(2))
                .andExpect(jsonPath("$.lines[0].inventoryTransactionId").isNotEmpty())
                .andExpect(jsonPath("$.lines[1].inventoryTransactionId").isNotEmpty())
                .andReturn().getResponse().getContentAsString());

        String receiptId = receipt.get("id").asString();
        String purchaseOrderId = receipt.get("purchaseOrderId").asString();
        String transactionId = receipt.at("/lines/0/inventoryTransactionId").asString();
        assertCost(fixture.item1Id(), transactionId, "0.533333", "25.60");
        assertCost(fixture.item2Id(), transactionId, "0.325000", "19.50");
        assertCloseValues(fixture.siteId(), "45.10", "-0.000016", "45.099984");

        // 验证生成的采购单状态为 COMPLETED
        mockMvc.perform(get("/api/pharmacy/purchase-orders").param("stockSiteId", fixture.siteId()).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + purchaseOrderId + "')].status").value("COMPLETED"));

        // 验证库存余额已真实增加
        assertEquals(48, jdbcTemplate.queryForObject("select sum(QTY_ON_HAND) from RHN_SUP_INV_BAL " +
                "where ID_STOCK_ITEM = ?", Integer.class, Long.valueOf(fixture.item1Id())));
        assertEquals(60, jdbcTemplate.queryForObject("select sum(QTY_ON_HAND) from RHN_SUP_INV_BAL " +
                "where ID_STOCK_ITEM = ?", Integer.class, Long.valueOf(fixture.item2Id())));

        // 验证到货验收单审计事件完整（RECEIVED -> INSPECTED -> POSTED）
        mockMvc.perform(get("/api/pharmacy/inventory-documents/GOODS_RECEIPT/{id}/events", receiptId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].eventType").value("RECEIVED"))
                .andExpect(jsonPath("$[1].eventType").value("INSPECTED"))
                .andExpect(jsonPath("$[2].eventType").value("POSTED"));
    }

    @ParameterizedTest
    @CsvSource({"24,0,0", "24,24,1", "1,12.8,12.8"})
    void direct_receipt_preserves_zero_and_exact_package_conversions(String factor, String price, String cost) throws Exception {
        jdbcTemplate.update("update RHN_BD_ITEM_PKG set QTY_FACTOR = ? where ID_ITEM_PKG = ?",
                new BigDecimal(factor), Long.valueOf(PACKAGE_1));
        Fixture fixture = createFixture("EXACT", false);
        JsonNode supplier = createSupplier(fixture.suffix());
        JsonNode receipt = directReceipt(fixture, supplier, "EXACT-" + fixture.suffix(), price);
        String transactionId = receipt.at("/lines/0/inventoryTransactionId").asString();
        assertCost(fixture.item1Id(), transactionId, cost, price);
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from RHN_SUP_INV_VALUAT_ENTRY where ID_SRC = ? and SD_ENTRY_TYPE = 'ROUNDING'",
                Integer.class, Long.valueOf(transactionId)));
        assertCloseValues(fixture.siteId(), price, "0", price);
    }

    @Test
    void weighted_cost_uses_document_amounts_and_records_rounding_once_per_receipt_line() throws Exception {
        Fixture fixture = createFixture("WEIGHT", false);
        JsonNode supplier = createSupplier(fixture.suffix());
        directReceipt(fixture, supplier, "WEIGHT-A-" + fixture.suffix(), "12.8");
        String requestCode = "WEIGHT-B-" + fixture.suffix();
        JsonNode second = directReceipt(fixture, supplier, requestCode, "12.800008");
        String transactionId = second.at("/lines/0/inventoryTransactionId").asString();
        assertEquals(0, jdbcTemplate.queryForObject("select PRICE_AVERAGE_UNIT_COST from RHN_SUP_INV_BAL where ID_STOCK_ITEM = ?",
                BigDecimal.class, Long.valueOf(fixture.item1Id())).compareTo(new BigDecimal("0.533333")));
        assertEquals(0, jdbcTemplate.queryForObject("select AMT_DELTA from RHN_SUP_INV_TXN_LINE where ID_INV_TXN = ?",
                BigDecimal.class, Long.valueOf(transactionId)).compareTo(new BigDecimal("12.800008")));
        JsonNode repeated = directReceipt(fixture, supplier, requestCode, "12.800008");
        assertEquals(second.get("id").asString(), repeated.get("id").asString());
        assertEquals(2, jdbcTemplate.queryForObject("select count(*) from RHN_SUP_INV_VALUAT_ENTRY where ID_STOCK_ITEM = ? and SD_ENTRY_TYPE = 'ROUNDING'",
                Integer.class, Long.valueOf(fixture.item1Id())));
        assertCloseValues(fixture.siteId(), "25.600008", "-0.000024", "25.599984");
    }

    @Test
    void receipt_rejects_price_precision_loss_without_committing_partial_documents() throws Exception {
        Fixture fixture = createFixture("PRECISION", false);
        JsonNode supplier = createSupplier(fixture.suffix());
        mockMvc.perform(post("/api/pharmacy/direct-goods-receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"stockSiteId":"%s","supplierId":"%s","requestCode":"PRECISION-%s",
                                 "receivedAt":"2026-08-28T10:00:00Z","lines":[
                                   {"stockItemId":"%s","packageId":"%s","destinationBinId":"%s","lotNo":"PRECISION-LOT",
                                    "productionDate":"2026-06-01","expiryDate":"2028-06-01","quantity":1,"unitPrice":12.8000001,"taxRate":0}]}
                                """.formatted(fixture.siteId(), supplier.get("id").asString(), fixture.suffix(),
                                fixture.item1Id(), PACKAGE_1, fixture.bin1Id())))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.violations[0].field").value("lines[0].unitPrice"));
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from RHN_SUP_GOOD_RCPT where ID_STOCK_SITE = ?",
                Integer.class, Long.valueOf(fixture.siteId())));
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from RHN_SUP_INV_BAL where ID_STOCK_ITEM = ?",
                Integer.class, Long.valueOf(fixture.item1Id())));
    }

    private JsonNode directReceipt(Fixture fixture, JsonNode supplier, String requestCode, String price) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/direct-goods-receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"stockSiteId":"%s","supplierId":"%s","requestCode":"%s",
                                 "receivedAt":"2026-08-28T10:00:00Z","lines":[
                                   {"stockItemId":"%s","packageId":"%s","destinationBinId":"%s","lotNo":"VALUE-LOT",
                                    "productionDate":"2026-06-01","expiryDate":"2028-06-01","quantity":1,"unitPrice":%s,"taxRate":0}]}
                                """.formatted(fixture.siteId(), supplier.get("id").asString(), requestCode,
                                fixture.item1Id(), PACKAGE_1, fixture.bin1Id(), price)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("POSTED"))
                .andReturn().getResponse().getContentAsString());
    }

    private void assertCost(String itemId, String transactionId, String cost, String amount) {
        assertEquals(0, jdbcTemplate.queryForObject("select PRICE_UNIT_COST from RHN_SUP_INV_TXN_LINE where ID_INV_TXN = ? and ID_STOCK_ITEM = ?",
                BigDecimal.class, Long.valueOf(transactionId), Long.valueOf(itemId)).compareTo(new BigDecimal(cost)));
        assertEquals(0, jdbcTemplate.queryForObject("select AMT_DELTA from RHN_SUP_INV_TXN_LINE where ID_INV_TXN = ? and ID_STOCK_ITEM = ?",
                BigDecimal.class, Long.valueOf(transactionId), Long.valueOf(itemId)).compareTo(new BigDecimal(amount)));
        assertEquals(0, jdbcTemplate.queryForObject("select PRICE_AVERAGE_UNIT_COST from RHN_SUP_INV_BAL where ID_STOCK_ITEM = ?",
                BigDecimal.class, Long.valueOf(itemId)).compareTo(new BigDecimal(cost)));
    }

    private void assertCloseValues(String siteId, String movement, String rounding, String closing) throws Exception {
        String periodId = json(mockMvc.perform(get("/api/pharmacy/inventory-periods").with(rhnWorkContext())
                        .queryParam("stockSiteId", siteId)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).get(0).get("id").asString();
        JsonNode result = json(mockMvc.perform(post("/api/pharmacy/inventory-periods/{id}/close-runs", periodId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestCode\":\"COST-CHECK-%s\",\"currencyCode\":\"CNY\"}".formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(0, result.get("differenceCount").asInt());
        assertEquals(0, result.at("/totals/0/movementAmount").decimalValue().compareTo(new BigDecimal(movement)));
        assertEquals(0, result.at("/totals/0/roundingAdjustmentAmount").decimalValue().compareTo(new BigDecimal(rounding)));
        assertEquals(0, result.at("/totals/0/closingValue").decimalValue().compareTo(new BigDecimal(closing)));
    }

    private Fixture createFixture(String prefix) throws Exception {
        return createFixture(prefix, true);
    }

    private Fixture createFixture(String prefix, boolean traceRequired) throws Exception {
        String suffix = prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"WH-%s","name":"中心药库%s",
                                 "siteType":"WAREHOUSE","serviceScope":"MIXED","validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String siteId = site.get("id").asString();
        String item1 = createStockItem(siteId, PRODUCT_1, PACKAGE_1, traceRequired);
        String item2 = createStockItem(siteId, PRODUCT_2, PACKAGE_2, traceRequired);
        String bin1 = createBin(siteId, "RCV-A", "收货合格区A");
        String bin2 = createBin(siteId, "RCV-B", "收货合格区B");
        return new Fixture(suffix, siteId, item1, item2, bin1, bin2);
    }

    private String createStockItem(String siteId, String productId, String packageId) throws Exception {
        return createStockItem(siteId, productId, packageId, true);
    }

    private String createStockItem(String siteId, String productId, String packageId, boolean traceRequired) throws Exception {
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-items", siteId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                 "negativeAllowed":false,"lotRequired":true,"traceRequired":%s,
                                 "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false}
                                """.formatted(productId, packageId, traceRequired)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return item.get("id").asString();
    }

    private String createBin(String siteId, String code, String name) throws Exception {
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-bins", siteId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"%s","name":"%s","binType":"BIN","stockDefault":"AVAILABLE",
                                 "receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":10}
                                """.formatted(code, name)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return bin.get("id").asString();
    }

    private record Fixture(String suffix, String siteId, String item1Id, String item2Id,
                           String bin1Id, String bin2Id) {}
}
