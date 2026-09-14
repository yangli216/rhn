package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class StockTransferWorkflowTest extends RhnIntegrationTestSupport {
    private static final String SOURCE_DEPARTMENT="362387869799102", DESTINATION_DEPARTMENT="362387869799103";
    private static final String SOURCE_SITE="362387869799501", DESTINATION_SITE="362387869799502";
    private static final String PRODUCT="362387869795113", PACKAGE="362387869795403";
    @Test void transfer_dispatch_in_transit_and_destination_confirmation_preserve_batch_and_discrepancy() throws Exception {
        String suffix=UUID.randomUUID().toString().replace("-","").substring(0,8).toUpperCase();
        String occurredAt=Instant.now().toString();
        RequestPostProcessor source=workContext(SOURCE_DEPARTMENT),destination=workContext(DESTINATION_DEPARTMENT);
        JsonNode sourceItem=createItem(SOURCE_SITE,source),destinationItem=findItem(DESTINATION_SITE,destination);
        String packageUnit=sourceItem.get("packageUnitCode").asString();
        BigDecimal packageFactor=sourceItem.get("packageFactor").decimalValue();
        BigDecimal receivedBaseQuantity=packageFactor.subtract(new BigDecimal("2"));
        JsonNode sourceBin=createBin(SOURCE_SITE,"SRC-"+suffix,"药库拣货位",source),destinationBin=createBin(DESTINATION_SITE,"DST-"+suffix,"药房收货位",destination);
        JsonNode lot=json(mockMvc.perform(post("/api/pharmacy/stock-items/{id}/lots",sourceItem.get("id").asString()).with(source).contentType(MediaType.APPLICATION_JSON).content("""
                {"lotNo":"TR-%s","productionDate":"2026-01-01","expiryDate":"2028-01-01","qualityStatus":"QUALIFIED"}
                """.formatted(suffix))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/inventory/receipts").with(source).contentType(MediaType.APPLICATION_JSON).content("""
                {"requestCode":"TR-RCV-%s","sourceCode":"OPENING-%s","stockItemId":"%s","stockBinId":"%s","stockLotId":"%s","operationQuantity":1,"unitCost":10,"occurredAt":"%s"}
                """.formatted(suffix,suffix,sourceItem.get("id").asString(),sourceBin.get("id").asString(),lot.get("id").asString(),occurredAt))).andExpect(status().isCreated());
        JsonNode transfer=json(mockMvc.perform(post("/api/pharmacy/stock-transfers").with(source).contentType(MediaType.APPLICATION_JSON).content("""
                {"sourceSiteId":"%s","destinationSiteId":"%s","requestCode":"TR-%s","reason":"门诊药房整包装补货","lines":[{"sourceStockItemId":"%s","destinationStockItemId":"%s","requestedQuantity":1,"operationUnitCode":"%s","baseQuantityFactor":%s}]}
                """.formatted(SOURCE_SITE,DESTINATION_SITE,suffix,sourceItem.get("id").asString(),destinationItem.get("id").asString(),packageUnit,packageFactor.toPlainString())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.lines[0].requestedOperationQuantity").value(1.0))
                .andExpect(jsonPath("$.lines[0].operationUnitCode").value(packageUnit))
                .andExpect(jsonPath("$.lines[0].baseQuantityFactor").value(packageFactor.doubleValue()))
                .andExpect(jsonPath("$.lines[0].requestedQuantity").value(packageFactor.doubleValue()))
                .andReturn().getResponse().getContentAsString());
        String id=transfer.get("id").asString(),lineId=transfer.at("/lines/0/id").asString();
        mockMvc.perform(post("/api/pharmacy/stock-transfers/{id}/submit",id).with(source)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUBMITTED"));
        mockMvc.perform(post("/api/pharmacy/stock-transfers/{id}/approve",id).with(source).contentType(MediaType.APPLICATION_JSON).content("""
                {"reason":"同意调拨","lines":[{"transferLineId":"%s","approvedQuantity":%s}]}
                """.formatted(lineId,packageFactor.toPlainString()))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        JsonNode picked=json(mockMvc.perform(post("/api/pharmacy/stock-transfers/{id}/pick",id).with(source)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PICKING")).andReturn().getResponse().getContentAsString());
        String allocationId=picked.at("/lines/0/allocations/0/id").asString();
        JsonNode dispatched=json(mockMvc.perform(post("/api/pharmacy/stock-transfers/{id}/dispatch",id).with(source)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_TRANSIT")).andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/pharmacy/stock-transfers").with(destination).param("stockSiteId",DESTINATION_SITE).param("role","DESTINATION")).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(id)).value("IN_TRANSIT"));
        JsonNode received=json(mockMvc.perform(post("/api/pharmacy/stock-transfers/{id}/receive",id).with(destination).contentType(MediaType.APPLICATION_JSON).content("""
                {"reason":"运输破损2个最小单位","allocations":[{"transferAllocationId":"%s","destinationBinId":"%s","receivedQuantity":%s,"damagedQuantity":2,"discrepancyReason":"外箱挤压"}]}
                """.formatted(allocationId,destinationBin.get("id").asString(),receivedBaseQuantity.toPlainString()))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED")).andExpect(jsonPath("$.lines[0].receivedQuantity").value(receivedBaseQuantity.doubleValue())).andExpect(jsonPath("$.lines[0].damagedQuantity").value(2.0)).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/pharmacy/stock-transfers/{id}/receive",id).with(destination).contentType(MediaType.APPLICATION_JSON).content("""
                {"reason":"运输破损2个最小单位","allocations":[{"transferAllocationId":"%s","destinationBinId":"%s","receivedQuantity":%s,"damagedQuantity":2,"discrepancyReason":"外箱挤压"}]}
                """.formatted(allocationId,destinationBin.get("id").asString(),receivedBaseQuantity.toPlainString()))).andExpect(status().isOk()).andExpect(jsonPath("$.inboundTransactionId").value(received.get("inboundTransactionId").asString()));
        mockMvc.perform(get("/api/pharmacy/inventory/balances").with(destination).param("stockSiteId",DESTINATION_SITE).param("stockItemId",destinationItem.get("id").asString())).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.stockStatus == 'AVAILABLE' && @.stockBinId == '%s')].quantityOnHand".formatted(destinationBin.get("id").asString())).value(receivedBaseQuantity.doubleValue())).andExpect(jsonPath("$[?(@.stockStatus == 'DAMAGED')].quantityOnHand").value(2.0));
        mockMvc.perform(get("/api/pharmacy/inventory/transactions").with(source).param("stockSiteId",SOURCE_SITE)).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == '%s')].sourceType".formatted(dispatched.get("outboundTransactionId").asString())).value("STOCK_TRANSFER_OUT"));
    }
    private JsonNode createItem(String site,RequestPostProcessor context)throws Exception{return json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-items",site).with(context).contentType(MediaType.APPLICATION_JSON).content("""
            {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO","negativeAllowed":false,"lotRequired":true,"traceRequired":false,"splitAllowed":true,"coldChain":false,"controlled":false,"highAlert":false}
            """.formatted(PRODUCT,PACKAGE))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());}
    private JsonNode findItem(String site,RequestPostProcessor context)throws Exception{return json(mockMvc.perform(get("/api/pharmacy/stock-sites/{id}/stock-items",site).with(context))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.catalogItemId == '%s')]".formatted(PRODUCT)).exists())
            .andReturn().getResponse().getContentAsString()).get(0);}
    private JsonNode createBin(String site,String code,String name,RequestPostProcessor context)throws Exception{return json(mockMvc.perform(post("/api/pharmacy/stock-sites/{id}/stock-bins",site).with(context).contentType(MediaType.APPLICATION_JSON).content("""
            {"code":"%s","name":"%s","binType":"BIN","stockDefault":"AVAILABLE","receiveAllowed":true,"pickAllowed":true,"countAllowed":true,"sortOrder":10}
            """.formatted(code,name))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());}
    private RequestPostProcessor workContext(String department){return request->{httpBasic("doctor","test-password").postProcessRequest(request);((MockHttpServletRequest)request).addHeader("X-Tenant-Id",TENANT);((MockHttpServletRequest)request).addHeader("X-Client-Session-Id","test-session-doctor");((MockHttpServletRequest)request).addHeader("X-Organization-Id",ORGANIZATION);((MockHttpServletRequest)request).addHeader("X-Department-Id",department);return request;};}
}
