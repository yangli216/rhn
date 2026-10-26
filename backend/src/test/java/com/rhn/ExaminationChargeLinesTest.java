package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 检查申请按收费方案逐行落账：主项目、多部位加收与附加项目各成一条收费事项，整单结算、冲销与取消签署。 */
class ExaminationChargeLinesTest extends RhnIntegrationTestSupport {
    private static final String IMAGING_SERVICE_ID = "362387869795103";
    private static final String CHARGE_ITEM_ID = "362387869795101";
    private static final String PROFILE_URL = "/api/platform/master-data/operations/services/" + IMAGING_SERVICE_ID;

    @Autowired JdbcTemplate jdbc;

    @Test
    void examination_order_posts_one_charge_per_plan_line() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        configureBasePlusItem();
        addAttachment();
        String first = addSite("CL-A-" + suffix, "部位甲" + suffix);
        String second = addSite("CL-B-" + suffix, "部位乙" + suffix);
        String encounterId = startedEncounter(suffix);

        JsonNode request = json(createRequest(encounterId, first, second)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantity").value(1))
                .andReturn().getResponse().getContentAsString());
        String requestId = request.get("id").asString();
        List<Map<String, Object>> charges = charges("SERVICE_REQUEST", requestId);
        assertEquals(List.of("1:BASE_SERVICE:" + IMAGING_SERVICE_ID, "2:MULTI_SITE_ITEM:" + CHARGE_ITEM_ID,
                "3:ATTACHMENT:" + CHARGE_ITEM_ID), charges.stream().map(row -> row.get("SN_CHG_LINE") + ":"
                + row.get("SD_CHG_ROLE") + ":" + row.get("ID_CATALOG_ITEM")).toList());
        BigDecimal posted = charges.stream().map(row -> new BigDecimal(row.get("AMT_TOTAL").toString()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertEquals(0, request.get("totalAmount").decimalValue().compareTo(posted));
        assertTrue(request.get("totalAmount").decimalValue().compareTo(request.get("unitPrice").decimalValue()) > 0);
        assertEquals(3, jdbc.queryForObject("select count(*) from RHN_EX_SVC_REQ_CHG where ID_CARE_REQ = ?",
                Integer.class, Long.valueOf(requestId)));
        assertEquals(0, posted.compareTo(jdbc.queryForObject("""
                select sum(l.AMT_ENTRY) from RHN_BIL_LEDGER_ENTRY l join RHN_BIL_CHARGE_ITEM c
                  on c.ID_TNT = l.ID_TNT and c.ID_CHARGE_ITEM = l.ID_CHARGE_ITEM
                where c.SD_SRC_TYPE = 'SERVICE_REQUEST' and c.ID_SRC = ? and l.SD_DIR = 'DEBIT'
                """, BigDecimal.class, Long.valueOf(requestId))));

        JsonNode statement = json(mockMvc.perform(get("/api/billing/encounters/{id}/statement", encounterId)
                        .with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/billing/accounts/{accountId}/invoices", statement.get("accountId").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"invoiceNo":"INV-CL-%s","settlementScene":"OUTPATIENT","terminalScene":"CASHIER",
                         "terminalCode":"CASHIER-WEB","chargeItemIds":["%s"]}
                        """.formatted(suffix, charges.getFirst().get("ID_CHARGE_ITEM"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVOICE_ORDER_LINES_INCOMPLETE"));

        mockMvc.perform(post("/api/encounters/{id}/service-requests/{requestId}/cancel", encounterId, requestId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + request.get("revision").asLong() + ",\"reason\":\"部位开错\"}"))
                .andExpect(status().isOk());
        List<Map<String, Object>> reversals = charges("SERVICE_REQUEST_REVERSAL", requestId);
        assertEquals(List.of(1, 2, 3), reversals.stream().map(row -> ((Number) row.get("SN_CHG_LINE")).intValue()).toList());
        for (int index = 0; index < 3; index++) {
            assertEquals(charges.get(index).get("ID_CHARGE_ITEM"), reversals.get(index).get("ID_CHARGE_ITEM_RVRS"));
            assertEquals(0, new BigDecimal(charges.get(index).get("AMT_TOTAL").toString()).negate()
                    .compareTo(new BigDecimal(reversals.get(index).get("AMT_TOTAL").toString())));
        }

        JsonNode single = json(createRequest(encounterId, first)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(2, charges("SERVICE_REQUEST", single.get("id").asString()).size());
        mockMvc.perform(post("/api/encounters/{id}/service-requests/{requestId}/withdraw-signature", encounterId,
                        single.get("id").asString()).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + single.get("revision").asLong() + "}"))
                .andExpect(status().isOk());
        assertEquals(0, charges("SERVICE_REQUEST", single.get("id").asString()).size());
    }

    private void configureBasePlusItem() throws Exception {
        JsonNode current = json(mockMvc.perform(get(PROFILE_URL + "/clinical-configuration").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(put(PROFILE_URL + "/examination-profile").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"examinationType":"ULTRASOUND","bodySiteRequired":true,
                         "multiBodySite":true,"maxBodySiteCount":3,"preparationDescription":"按部位检查",
                         "sitePricingMode":"BASE_PLUS_ITEM","includedSiteCount":1,
                         "additionalSiteItemId":"%s","additionalSiteQuantity":1,"maxChargeableSiteCount":3}
                        """.formatted(current.get("examination").get("revision").asLong(), CHARGE_ITEM_ID)))
                .andExpect(status().isOk());
    }

    private void addAttachment() throws Exception {
        mockMvc.perform(post(PROFILE_URL + "/examination-attachments").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"attachmentCatalogItemId":"%s","triggerType":"ALWAYS","quantityBasis":"FIXED","quantity":1,
                         "requiredAttachment":true,"separatelyChargeable":true,"sortOrder":10,
                         "description":"必收附加项目","status":"ACTIVE"}
                        """.formatted(CHARGE_ITEM_ID)))
                .andExpect(status().isCreated());
    }

    private String addSite(String code, String name) throws Exception {
        mockMvc.perform(post(PROFILE_URL + "/examination-variants").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"code":"%s","name":"%s","methodType":"STANDARD","bodySiteRequired":true,
                         "sortOrder":40,"status":"ACTIVE"}
                        """.formatted(code, name)))
                .andExpect(status().isCreated());
        return code;
    }

    private String startedEncounter(String suffix) throws Exception {
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"fullName":"收费明细测试","gender":"2","birthDate":"1990-05-05",
                         "identifiers":[{"system":"9","value":"CHGL-%s","useType":"SECONDARY"}]}
                        """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                        """.formatted(resident.get("id").asString(), ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asString())).andExpect(status().isOk());
        return encounter.get("id").asString();
    }

    private org.springframework.test.web.servlet.ResultActions createRequest(String encounterId, String... sites) throws Exception {
        String siteJson = Arrays.stream(sites).map(code -> "\"" + code + "\"").collect(Collectors.joining(","));
        return mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"catalogItemId":"%s","quantity":1,"priceType":"SALE","pricingRequired":true,
                         "performerDepartmentId":"%s","reason":"收费明细测试","bodySiteCodes":[%s]}
                        """.formatted(IMAGING_SERVICE_ID, DEPARTMENT, siteJson)));
    }

    private List<Map<String, Object>> charges(String sourceType, String requestId) {
        return jdbc.queryForList("""
                select ID_CHARGE_ITEM, SN_CHG_LINE, SD_CHG_ROLE, ID_CATALOG_ITEM, AMT_TOTAL, ID_CHARGE_ITEM_RVRS
                from RHN_BIL_CHARGE_ITEM where SD_SRC_TYPE = ? and ID_SRC = ? order by SN_CHG_LINE
                """, sourceType, Long.valueOf(requestId));
    }
}
