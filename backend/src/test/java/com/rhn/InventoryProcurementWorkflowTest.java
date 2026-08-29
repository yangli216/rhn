package com.rhn;

import com.rhn.pharmacy.domain.InventorySplitEvent;
import com.rhn.pharmacy.infrastructure.InventorySplitEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
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

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
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
        String receiptId = receipt.get("id").asText();
        String receiptLine1 = receipt.at("/lines/0/id").asText();
        String receiptLine2 = receipt.at("/lines/1/id").asText();
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
        String transaction1 = posted.at("/lines/0/inventoryTransactionId").asText();

        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/post", receiptId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.lines[0].inventoryTransactionId").value(transaction1));
        mockMvc.perform(get("/api/pharmacy/inventory/transactions").with(rhnWorkContext())
                        .param("stockSiteId", fixture.siteId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.sourceType == 'GOODS_RECEIPT')].sourceCode")
                        .value(receipt.get("receiptNo").asText()));
        mockMvc.perform(get("/api/pharmacy/inventory-documents/GOODS_RECEIPT/{id}/events", receiptId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].eventType").value("RECEIVED"))
                .andExpect(jsonPath("$[1].eventType").value("INSPECTED"))
                .andExpect(jsonPath("$[2].eventType").value("POSTED"));

        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from inventory_transactions " +
                "where source_type = 'GOODS_RECEIPT' and source_code = ?", Integer.class,
                receipt.get("receiptNo").asText()));
        assertEquals(24, jdbcTemplate.queryForObject("select sum(quantity_on_hand) from inventory_balances " +
                "where stock_item_id = ?", Integer.class, Long.valueOf(fixture.item1Id())));
        assertEquals(40, jdbcTemplate.queryForObject("select sum(quantity_on_hand) from inventory_balances " +
                "where stock_item_id = ?", Integer.class, Long.valueOf(fixture.item2Id())));
        mockMvc.perform(get("/api/pharmacy/inventory/trace-codes").with(rhnWorkContext())
                        .param("stockSiteId", fixture.siteId()).param("query", "TRACE-B"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].status").value("AVAILABLE"));
        JsonNode traceA = json(mockMvc.perform(get("/api/pharmacy/inventory/trace-codes").with(rhnWorkContext())
                        .param("stockSiteId", fixture.siteId()).param("query", "TRACE-A"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andReturn().getResponse().getContentAsString()).get(0);
        JsonNode opened = json(mockMvc.perform(post("/api/pharmacy/inventory/open-packages").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"OPEN-TRACE-%s","stockSiteId":"%s","stockBinId":"%s",
                                 "stockItemId":"%s","stockLotId":"%s","occurredAt":"2026-08-29T00:00:00Z"}
                                """.formatted(fixture.suffix(), fixture.siteId(), fixture.bin1Id(),
                                fixture.item1Id(), traceA.get("stockLotId").asText())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.traceCodeId").value(traceA.get("id").asText()))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/pharmacy/inventory/trace-codes/{id}", traceA.get("id").asText())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code.status").value("OPENED"))
                .andExpect(jsonPath("$.code.remainingBaseQuantity").value(24))
                .andExpect(jsonPath("$.events[1].eventType").value("SPLIT_OPEN"))
                .andExpect(jsonPath("$.events[1].balanceAfter").value(24));
        assertEquals(traceA.get("id").asText(), opened.get("traceCodeId").asText());
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
        String receiptId = receipt.get("id").asText();
        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/inspect", receiptId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lines":[
                                  {"goodsReceiptLineId":"%s","acceptedQuantity":2,"rejectedQuantity":0},
                                  {"goodsReceiptLineId":"%s","acceptedQuantity":3,"rejectedQuantity":0}
                                ]}
                                """.formatted(receipt.at("/lines/0/id").asText(), receipt.at("/lines/1/id").asText())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACCEPTED"));
        registerTraceCodes(receiptId, receipt.at("/lines/0/id").asText(),
                List.of("TRACE-R1-" + fixture.suffix(), "TRACE-R2-" + fixture.suffix()),
                receipt.at("/lines/1/id").asText(), List.of("TRACE-R3-" + fixture.suffix(),
                        "TRACE-R4-" + fixture.suffix(), "TRACE-R5-" + fixture.suffix()));
        jdbcTemplate.update("update stock_bins set receive_allowed = false where id = ?", Long.valueOf(fixture.bin2Id()));

        mockMvc.perform(post("/api/pharmacy/goods-receipts/{id}/post", receiptId).with(rhnWorkContext()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STOCK_BIN_NOT_RECEIVABLE"));
        assertEquals(0, jdbcTemplate.queryForObject("select count(*) from inventory_transactions " +
                "where source_type = 'GOODS_RECEIPT' and source_code = ?", Integer.class,
                receipt.get("receiptNo").asText()));
        assertEquals("ACCEPTED", jdbcTemplate.queryForObject("select status from goods_receipts where id = ?",
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
        mockMvc.perform(post("/api/pharmacy/suppliers/{id}/supply-items", supplier.get("id").asText())
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
                                """.formatted(fixture.siteId(), supplier.get("id").asText(), fixture.suffix(),
                                fixture.item1Id(), PACKAGE_1, fixture.item2Id(), PACKAGE_2)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/purchase-orders/{id}/submit", order.get("id").asText()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUBMITTED"));
        return json(mockMvc.perform(post("/api/pharmacy/purchase-orders/{id}/approve", order.get("id").asText())
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
                                """.formatted(order.get("id").asText(), requestCode, fixture.suffix(),
                                order.at("/lines/0/id").asText(), fixture.bin1Id(), fixture.suffix(),
                                order.at("/lines/1/id").asText(), fixture.bin2Id(), fixture.suffix())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("RECEIVED"))
                .andReturn().getResponse().getContentAsString());
    }

    private Fixture createFixture(String prefix) throws Exception {
        String suffix = prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"WH-%s","name":"中心药库%s",
                                 "siteType":"WAREHOUSE","serviceScope":"MIXED","validFrom":"2026-01-01"}
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String siteId = site.get("id").asText();
        String item1 = createStockItem(siteId, PRODUCT_1, PACKAGE_1);
        String item2 = createStockItem(siteId, PRODUCT_2, PACKAGE_2);
        String bin1 = createBin(siteId, "RCV-A", "收货合格区A");
        String bin2 = createBin(siteId, "RCV-B", "收货合格区B");
        return new Fixture(suffix, siteId, item1, item2, bin1, bin2);
    }

    private String createStockItem(String siteId, String productId, String packageId) throws Exception {
        JsonNode item = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-items", siteId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                 "negativeAllowed":false,"lotRequired":true,"traceRequired":true,
                                 "splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false}
                                """.formatted(productId, packageId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return item.get("id").asText();
    }

    private String createBin(String siteId, String code, String name) throws Exception {
        JsonNode bin = json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-bins", siteId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"%s","name":"%s","binType":"BIN","stockDefault":"AVAILABLE",
                                 "receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":10}
                                """.formatted(code, name)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return bin.get("id").asText();
    }

    private record Fixture(String suffix, String siteId, String item1Id, String item2Id,
                           String bin1Id, String bin2Id) {}
}
