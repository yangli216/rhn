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
class StockRequisitionWorkflowTest extends RhnIntegrationTestSupport {
    private static final String PRODUCT = "362387869795113";
    private static final String PACKAGE = "362387869795403";

    @Test
    void department_requisition_approval_fefo_picking_and_issue_form_closed_loop() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
        JsonNode site = createSite(suffix); String siteId = site.get("id").asString();
        JsonNode item = createItem(siteId); String itemId = item.get("id").asString();
        JsonNode bin = createBin(siteId); String binId = bin.get("id").asString();
        JsonNode early = createLot(itemId, "REQ-E-" + suffix, "2027-01-01");
        JsonNode late = createLot(itemId, "REQ-L-" + suffix, "2028-01-01");
        receive("REQ-RCV-E-" + suffix, itemId, binId, early.get("id").asString(), 1);
        receive("REQ-RCV-L-" + suffix, itemId, binId, late.get("id").asString(), 2);

        JsonNode requisition = json(mockMvc.perform(post("/api/pharmacy/stock-requisitions").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"sourceSiteId":"%s","requestCode":"REQ-%s","reason":"门诊日常领用",
                                 "lines":[{"stockItemId":"%s","requestedQuantity":20}]}
                                """.formatted(siteId, suffix, itemId)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString());
        String id = requisition.get("id").asString(); String lineId = requisition.at("/lines/0/id").asString();
        mockMvc.perform(post("/api/pharmacy/stock-requisitions/{id}/submit", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUBMITTED"));
        mockMvc.perform(post("/api/pharmacy/stock-requisitions/{id}/approve", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"reason":"审核通过","lines":[{"requisitionLineId":"%s","approvedQuantity":20}]}
                                """.formatted(lineId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        mockMvc.perform(post("/api/pharmacy/stock-requisitions/{id}/pick", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PICKING"))
                .andExpect(jsonPath("$.lines[0].allocations.length()").value(2))
                .andExpect(jsonPath("$.lines[0].allocations[0].stockLotId").value(early.get("id").asString()))
                .andExpect(jsonPath("$.lines[0].allocations[0].allocatedQuantity").value(14))
                .andExpect(jsonPath("$.lines[0].allocations[1].allocatedQuantity").value(6));
        JsonNode issued = json(mockMvc.perform(post("/api/pharmacy/stock-requisitions/{id}/issue", id)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ISSUED"))
                .andExpect(jsonPath("$.lines[0].issuedQuantity").value(20))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/stock-requisitions/{id}/issue", id).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.inventoryTransactionId")
                        .value(issued.get("inventoryTransactionId").asString()));
        mockMvc.perform(get("/api/pharmacy/inventory/transactions").with(rhnWorkContext())
                        .param("stockSiteId", siteId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.sourceType == 'STOCK_REQUISITION')].transactionType").value("ISSUE"));
        mockMvc.perform(get("/api/pharmacy/inventory/balances").with(rhnWorkContext())
                        .param("stockSiteId", siteId).param("stockItemId", itemId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.stockLotId == '%s')].quantityOnHand".formatted(early.get("id").asString())).value(0.0))
                .andExpect(jsonPath("$[?(@.stockLotId == '%s')].quantityOnHand".formatted(late.get("id").asString())).value(22.0))
                .andExpect(jsonPath("$[*].quantityReserved").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.comparesEqualTo(0.0))));
    }

    private JsonNode createSite(String suffix) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"organizationId":"%s","departmentId":"%s","code":"REQ-WH-%s","name":"请领药库%s",
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
                                {"code":"PICK-A","name":"拣货位","binType":"BIN","stockDefault":"AVAILABLE",
                                 "receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":10}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    private JsonNode createLot(String itemId, String lotNo, String expiry) throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-items/{id}/lots", itemId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"lotNo":"%s","productionDate":"2026-01-01","expiryDate":"%s","qualityStatus":"QUALIFIED"}
                                """.formatted(lotNo, expiry)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    private void receive(String requestCode, String itemId, String binId, String lotId, int quantity) throws Exception {
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"requestCode":"%s","sourceCode":"OPENING-%s","stockItemId":"%s",
                                 "stockBinId":"%s","stockLotId":"%s","operationQuantity":%d,"unitCost":10,
                                 "occurredAt":"%s"}
                                """.formatted(requestCode, requestCode, itemId, binId, lotId, quantity, Instant.now())))
                .andExpect(status().isCreated());
    }
}
