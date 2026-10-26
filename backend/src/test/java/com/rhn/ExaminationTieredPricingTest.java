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
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 检查项目 P2：开立项目本身不收费，按计费部位数命中阶梯档位或收主收费物价项；部位方式的计费部位数参与折算；
 * 部位词典提供标准部位、别名与层级。
 */
class ExaminationTieredPricingTest extends RhnIntegrationTestSupport {
    private static final String EXAM_ID = "362387869795103";
    private static final String TIER_ONE_ITEM = "362387869795101";
    private static final String TIER_TWO_ITEM = "362387869795105";
    private static final String PROFILE_URL = "/api/platform/master-data/operations/services/" + EXAM_ID;
    private static final long BS_ABD = 362387871100122L;
    private static final long BS_HBSP = 362387871100123L;
    private static final long BS_LIVER = 362387871100124L;

    @Autowired JdbcTemplate jdbc;

    @Test
    void tiered_examination_charges_the_tier_item_matched_by_chargeable_site_count() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        jdbc.update("update RHN_BD_CATALOG_ITEM set FG_CHGBL = false where ID_CATALOG_ITEM = ?", Long.valueOf(EXAM_ID));
        String one = addSite("TI-A-" + suffix, "单部位" + suffix, null, 1);
        String other = addSite("TI-B-" + suffix, "另一部位" + suffix, null, 1);
        String combined = addSite("TI-C-" + suffix, "肝胆脾胰" + suffix, BS_HBSP, 2);

        mockMvc.perform(put(PROFILE_URL + "/examination-price-tiers").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"tiers":[{"siteFrom":1,"siteTo":1,"chargeItemId":"%s"},
                          {"siteFrom":3,"chargeItemId":"%s"}]}
                        """.formatted(profileRevision(), TIER_ONE_ITEM, TIER_TWO_ITEM)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EXAM_PRICE_TIER_GAP"));
        mockMvc.perform(put(PROFILE_URL + "/examination-profile").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(profileJson(profileRevision(), "TIERED_ITEM", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EXAM_PRICE_TIER_REQUIRED"));
        JsonNode configured = json(mockMvc.perform(put(PROFILE_URL + "/examination-price-tiers").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"tiers":[{"siteFrom":2,"chargeItemId":"%s","chargeQuantity":1},
                          {"siteFrom":1,"siteTo":1,"chargeItemId":"%s"}]}
                        """.formatted(profileRevision(), TIER_TWO_ITEM, TIER_ONE_ITEM)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode tiers = configured.get("examination").get("priceTiers");
        assertEquals(2, tiers.size());
        assertEquals(TIER_ONE_ITEM, tiers.get(0).get("chargeItemId").asString());
        assertTrue(tiers.get(1).get("siteTo").isNull());
        mockMvc.perform(put(PROFILE_URL + "/examination-profile").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(profileJson(profileRevision(), "TIERED_ITEM", null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.examination.sitePricingMode").value("TIERED_ITEM"));

        assertPlan(List.of(one), 1, TIER_ONE_ITEM);
        assertPlan(List.of(combined), 2, TIER_TWO_ITEM);
        assertPlan(List.of(one, other), 2, TIER_TWO_ITEM);

        String encounterId = startedEncounter(suffix);
        JsonNode single = json(createRequest(encounterId, one)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(List.of("1:TIER:" + TIER_ONE_ITEM), chargeKeys("SERVICE_REQUEST", single.get("id").asString()));
        JsonNode liver = json(createRequest(encounterId, combined)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String liverId = liver.get("id").asString();
        List<Map<String, Object>> charges = charges("SERVICE_REQUEST", liverId);
        assertEquals(List.of("1:TIER:" + TIER_TWO_ITEM), chargeKeys("SERVICE_REQUEST", liverId));
        assertEquals(0, liver.get("totalAmount").decimalValue().compareTo(new BigDecimal(charges.getFirst().get("AMT_TOTAL").toString())));
        assertEquals(2, jdbc.queryForObject("select QTY_CHGBL_SITE_UNIT from RHN_EX_SVC_REQ_SITE where ID_CARE_REQ = ?",
                Integer.class, Long.valueOf(liverId)));

        mockMvc.perform(post("/api/encounters/{id}/service-requests/{requestId}/cancel", encounterId, liverId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":" + liver.get("revision").asLong() + ",\"reason\":\"部位开错\"}"))
                .andExpect(status().isOk());
        assertEquals(List.of("1:TIER:" + TIER_TWO_ITEM), chargeKeys("SERVICE_REQUEST_REVERSAL", liverId));

        mockMvc.perform(put(PROFILE_URL + "/examination-profile").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(profileJson(profileRevision(), "SINGLE", TIER_TWO_ITEM)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.examination.baseChargeItemId").value(TIER_TWO_ITEM));
        JsonNode based = json(createRequest(encounterId, one)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(List.of("1:BASE_SERVICE:" + TIER_TWO_ITEM), chargeKeys("SERVICE_REQUEST", based.get("id").asString()));
    }

    @Test
    void body_site_dictionary_exposes_aliases_and_rejects_cyclic_hierarchy() throws Exception {
        JsonNode sites = json(mockMvc.perform(get("/api/platform/terminology/body-sites").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode hbsp = StreamSupport.stream(sites.spliterator(), false)
                .filter(site -> "BS-HBSP".equals(site.get("code").asString())).findFirst().orElseThrow();
        assertEquals(String.valueOf(BS_ABD), hbsp.get("parentConceptIds").get(0).asString());
        assertTrue(StreamSupport.stream(hbsp.get("aliases").spliterator(), false)
                .anyMatch(alias -> "上腹部".equals(alias.asString())));

        mockMvc.perform(put("/api/platform/terminology/body-sites/{id}/parents", BS_ABD).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"parentConceptIds\":[\"" + BS_LIVER + "\"]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BODY_SITE_HIERARCHY_CYCLE"));
        mockMvc.perform(put("/api/platform/terminology/body-sites/{id}/parents", BS_LIVER).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"parentConceptIds\":[\"" + BS_ABD + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parentConceptIds[0]").value(String.valueOf(BS_ABD)));

        mockMvc.perform(post(PROFILE_URL + "/examination-variants").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"bodySiteConceptId":"362387869790215","code":"BAD-SITE","name":"非部位概念",
                         "methodType":"STANDARD","bodySiteRequired":true,"sortOrder":90,"status":"ACTIVE"}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EXAM_VARIANT_BODY_SITE_INVALID"));
    }

    private long profileRevision() throws Exception {
        return json(mockMvc.perform(get(PROFILE_URL + "/clinical-configuration").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .get("examination").get("revision").asLong();
    }

    private static String profileJson(long revision, String mode, String baseChargeItemId) {
        return """
                {"expectedRevision":%d,"examinationType":"ULTRASOUND","bodySiteRequired":true,
                 "multiBodySite":true,"maxBodySiteCount":3,"preparationDescription":"按部位检查",
                 "sitePricingMode":"%s","includedSiteCount":1,"additionalSiteQuantity":1,
                 "maxChargeableSiteCount":3%s}
                """.formatted(revision, mode, baseChargeItemId == null ? "" : ",\"baseChargeItemId\":\"" + baseChargeItemId + "\"");
    }

    private void assertPlan(List<String> sites, int chargeableSiteCount, String chargeItemId) throws Exception {
        String siteJson = sites.stream().map(code -> "\"" + code + "\"").collect(Collectors.joining(","));
        mockMvc.perform(post(PROFILE_URL + "/examination-charge-plan").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"bodySiteCodes\":[" + siteJson + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.chargeableSiteCount").value(chargeableSiteCount))
                .andExpect(jsonPath("$.lines[0].sourceType").value("TIER"))
                .andExpect(jsonPath("$.lines[0].catalogItemId").value(chargeItemId));
    }

    private String addSite(String code, String name, Long conceptId, int units) throws Exception {
        mockMvc.perform(post(PROFILE_URL + "/examination-variants").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {%s"code":"%s","name":"%s","methodType":"STANDARD","bodySiteRequired":true,
                         "sortOrder":40,"status":"ACTIVE","chargeableSiteUnits":%d}
                        """.formatted(conceptId == null ? "" : "\"bodySiteConceptId\":\"" + conceptId + "\",",
                        code, name, units)))
                .andExpect(status().isCreated());
        return code;
    }

    private String startedEncounter(String suffix) throws Exception {
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"fullName":"阶梯计价测试","gender":"1","birthDate":"1985-03-03",
                         "identifiers":[{"system":"9","value":"TIER-%s","useType":"SECONDARY"}]}
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
                         "performerDepartmentId":"%s","reason":"阶梯计价测试","bodySiteCodes":[%s]}
                        """.formatted(EXAM_ID, DEPARTMENT, siteJson)));
    }

    private List<String> chargeKeys(String sourceType, String requestId) {
        return charges(sourceType, requestId).stream().map(row -> row.get("SN_CHG_LINE") + ":"
                + row.get("SD_CHG_ROLE") + ":" + row.get("ID_CATALOG_ITEM")).toList();
    }

    private List<Map<String, Object>> charges(String sourceType, String requestId) {
        return jdbc.queryForList("""
                select ID_CHARGE_ITEM, SN_CHG_LINE, SD_CHG_ROLE, ID_CATALOG_ITEM, AMT_TOTAL
                from RHN_BIL_CHARGE_ITEM where SD_SRC_TYPE = ? and ID_SRC = ? order by SN_CHG_LINE
                """, sourceType, Long.valueOf(requestId));
    }
}
