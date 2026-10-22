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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 门诊检查开单选择部位：部位只能取已启用部位方式，按部位计价换算数量，收费构成按部位拆行。 */
class ExaminationBodySiteOrderingTest extends RhnIntegrationTestSupport {
    private static final String IMAGING_SERVICE_ID = "362387869795103";
    private static final String LABORATORY_SERVICE_ID = "362387869795101";
    private static final String PROFILE_URL = "/api/platform/master-data/operations/services/" + IMAGING_SERVICE_ID;

    @Autowired JdbcTemplate jdbc;

    @Test
    void examination_sites_drive_quantity_snapshot_and_charge_components() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        configurePerSitePricing(3, 2);
        String first = addSite("BS-A-" + suffix, "部位甲" + suffix);
        String second = addSite("BS-B-" + suffix, "部位乙" + suffix);
        String third = addSite("BS-C-" + suffix, "部位丙" + suffix);
        String encounterId = startedEncounter(suffix);

        JsonNode options = json(mockMvc.perform(get("/api/encounters/{id}/service-requests/examination-sites", encounterId)
                        .param("catalogItemId", IMAGING_SERVICE_ID).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").value(true))
                .andExpect(jsonPath("$.bodySiteRequired").value(true))
                .andExpect(jsonPath("$.sitePricingMode").value("PER_SITE"))
                .andReturn().getResponse().getContentAsString());
        List<String> codes = java.util.stream.StreamSupport.stream(options.get("sites").spliterator(), false)
                .map(site -> site.get("code").asString()).toList();
        assertEquals(true, codes.containsAll(List.of(first, second, third)));

        createRequest(encounterId, IMAGING_SERVICE_ID)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("EXAM_BODY_SITE_REQUIRED"));
        createRequest(encounterId, IMAGING_SERVICE_ID, "NOT-A-SITE-" + suffix)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("EXAM_BODY_SITE_INVALID"));
        createRequest(encounterId, LABORATORY_SERVICE_ID, first)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SERVICE_REQUEST_BODY_SITE_UNSUPPORTED"));

        JsonNode twoSites = json(createRequest(encounterId, IMAGING_SERVICE_ID, first, second)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.bodySites[0].code").value(first))
                .andExpect(jsonPath("$.bodySites[1].name").value("部位乙" + suffix))
                .andReturn().getResponse().getContentAsString());
        assertEquals(0, twoSites.get("unitPrice").decimalValue().multiply(BigDecimal.valueOf(2))
                .compareTo(twoSites.get("totalAmount").decimalValue()));
        assertEquals(List.of(first + ":1", second + ":1"), components("SERVICE_REQUEST", twoSites.get("id").asString()));

        mockMvc.perform(post("/api/encounters/{id}/service-requests/{requestId}/cancel", encounterId, twoSites.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + twoSites.get("revision").asLong() + ",\"reason\":\"部位开错\"}"))
                .andExpect(status().isOk());
        assertEquals(List.of(first + ":-1", second + ":-1"),
                components("SERVICE_REQUEST_REVERSAL", twoSites.get("id").asString()));

        JsonNode capped = json(createRequest(encounterId, IMAGING_SERVICE_ID, first, second, third)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.bodySites.length()").value(3))
                .andReturn().getResponse().getContentAsString());
        List<Map<String, Object>> cappedRows = componentRows("SERVICE_REQUEST", capped.get("id").asString());
        assertEquals(1, cappedRows.size());
        assertNull(cappedRows.getFirst().get("CD_BODY_SITE"));

        configurePerSitePricing(null, null);
    }

    private void configurePerSitePricing(Integer maxSites, Integer maxChargeable) throws Exception {
        JsonNode current = json(mockMvc.perform(get(PROFILE_URL + "/clinical-configuration").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        boolean multi = maxSites != null;
        mockMvc.perform(put(PROFILE_URL + "/examination-profile").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"examinationType":"ULTRASOUND","bodySiteRequired":true,
                         "multiBodySite":%s,"maxBodySiteCount":%s,"preparationDescription":"按部位检查",
                         "sitePricingMode":"%s","includedSiteCount":1,"maxChargeableSiteCount":%s}
                        """.formatted(current.get("examination").get("revision").asLong(), multi,
                        multi ? maxSites : 1, multi ? "PER_SITE" : "SINGLE", maxChargeable)))
                .andExpect(status().isOk());
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
                        {"fullName":"部位开单测试","gender":"2","birthDate":"1990-05-05",
                         "identifiers":[{"system":"9","value":"SITE-%s","useType":"SECONDARY"}]}
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

    private org.springframework.test.web.servlet.ResultActions createRequest(String encounterId, String catalogItemId,
                                                                             String... sites) throws Exception {
        String siteJson = Arrays.stream(sites).map(code -> "\"" + code + "\"").collect(Collectors.joining(","));
        return mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"catalogItemId":"%s","quantity":1,"priceType":"SALE","pricingRequired":true,
                         "performerDepartmentId":"%s","reason":"部位开单测试","bodySiteCodes":[%s]}
                        """.formatted(catalogItemId, DEPARTMENT, siteJson)));
    }

    private List<Map<String, Object>> componentRows(String sourceType, String requestId) {
        return jdbc.queryForList("""
                select c.CD_BODY_SITE, c.QTY_COMP from RHN_BIL_CHARGE_ITEM_COMP c
                join RHN_BIL_CHARGE_ITEM i on i.ID_CHARGE_ITEM = c.ID_CHARGE_ITEM and i.ID_TNT = c.ID_TNT
                where i.SD_SRC_TYPE = ? and i.ID_SRC = ? order by c.SN_LINE
                """, sourceType, Long.valueOf(requestId));
    }

    private List<String> components(String sourceType, String requestId) {
        return componentRows(sourceType, requestId).stream().map(row -> row.get("CD_BODY_SITE") + ":"
                + new BigDecimal(row.get("QTY_COMP").toString()).stripTrailingZeros().toPlainString()).toList();
    }
}
