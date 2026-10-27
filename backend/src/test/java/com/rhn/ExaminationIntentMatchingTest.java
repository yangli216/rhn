package com.rhn;

import com.rhn.ai.application.ClinicalAiModelGateway;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 检查项目 P4：AI 检查意图先按检查方式与超声方式定位唯一开立项目，再经部位词典对应到部位方式；
 * 同一开立项目的多条意图合并，部位确定后按收费方案与院内价格预览收费。
 * 用 P3 开发样例中的“彩超检查”开立项目：肝胆脾胰计 2 个部位，1 个部位收一个部位档，2 个及以上收多部位档。
 */
@TestPropertySource(properties = {
        "rhn.ai.mode=MODEL",
        "rhn.ai.provider=test-model-provider",
        "rhn.ai.model=test-clinical-model",
        "rhn.ai.endpoint=http://127.0.0.1:9/v1/chat/completions"
})
class ExaminationIntentMatchingTest extends RhnIntegrationTestSupport {
    private static final String COLOR_DOPPLER = "362387871200101";
    private static final String ONE_SITE_ITEM = "362387890000250";
    private static final String MULTI_SITE_ITEM = "362387890000251";
    private static final String ABDOMEN_US_URL = "/api/platform/master-data/operations/services/362387869795103";

    @MockitoBean ClinicalAiModelGateway modelGateway;

    @Test
    void structured_and_name_only_examination_intents_resolve_item_sites_and_charge_preview() throws Exception {
        mockMvc.perform(put(ABDOMEN_US_URL + "/examination-profile").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"examinationType":"ULTRASOUND","contrastPhase":"ENHANCED",
                         "bodySiteRequired":true,"multiBodySite":false,"sitePricingMode":"SINGLE","includedSiteCount":1,
                         "additionalSiteQuantity":1}
                        """.formatted(profileRevision(ABDOMEN_US_URL))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EXAM_CONTRAST_PHASE_NOT_ALLOWED"));
        String encounterId = startedEncounter(UUID.randomUUID().toString().substring(0, 6).toUpperCase());

        match(encounterId, """
                [{"type":"EXAMINATION","name":"腹部彩超","examination":{"modality":"US","technique":"COLOR_DOPPLER",
                  "bodySites":["肝胆脾胰"]}}]""")
                .andExpect(jsonPath("$[0].status").value("MATCHED"))
                .andExpect(jsonPath("$[0].candidates[0].catalogItemId").value(COLOR_DOPPLER))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.resolution").value("MATCHED"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.bodySites[0].code").value("HBSP"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.chargePreview.lines[0].role").value("TIER"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.chargePreview.lines[0].catalogItemId").value(MULTI_SITE_ITEM))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.chargePreview.totalAmount").value(140.0));

        match(encounterId, "[{\"type\":\"EXAMINATION\",\"name\":\"甲状腺彩超\"}]")
                .andExpect(jsonPath("$[0].status").value("MATCHED"))
                .andExpect(jsonPath("$[0].intent.examination.modality").value("US"))
                .andExpect(jsonPath("$[0].intent.examination.bodySites[0]").value("甲状腺"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.bodySites[0].code").value("THYROID"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.chargePreview.lines[0].catalogItemId").value(ONE_SITE_ITEM));

        match(encounterId, """
                [{"type":"EXAMINATION","name":"肾脏彩超","examination":{"modality":"US","technique":"COLOR_DOPPLER",
                  "bodySites":["肾脏"]}}]""")
                .andExpect(jsonPath("$[0].status").value("AMBIGUOUS"))
                .andExpect(jsonPath("$[0].reason").value(containsString("请核对检查部位")))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.resolution").value("PARTIAL"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.bodySites[0].code").value("URO"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.bodySites[0].requiresReview").value(true));

        match(encounterId, """
                [{"type":"EXAMINATION","name":"肝胆脾胰彩超","examination":{"modality":"US","technique":"COLOR_DOPPLER","bodySites":["上腹部"]}},
                 {"type":"EXAMINATION","name":"甲状腺彩超","examination":{"modality":"US","technique":"COLOR_DOPPLER","bodySites":["甲状腺"]}}]""")
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].status").value("MATCHED"))
                .andExpect(jsonPath("$[0].reason").value(containsString("已合并为一次检查")))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.bodySites.length()").value(2))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.chargePreview.lines[0].catalogItemId").value(MULTI_SITE_ITEM));

        match(encounterId, """
                [{"type":"EXAMINATION","name":"头颅CT平扫","examination":{"modality":"CT","contrastPhase":"PLAIN","bodySites":["头部","胸部"]}}]""")
                .andExpect(jsonPath("$[0].status").value("MATCHED"))
                .andExpect(jsonPath("$[0].candidates[0].catalogItemId").value("362387871200103"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.chargePreview.lines[0].catalogItemId").value("362387890000235"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.chargePreview.lines[1].catalogItemId").value("362387890000233"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.chargePreview.lines[1].quantity").value(2));

        match(encounterId, """
                [{"type":"EXAMINATION","name":"腹股沟区超声","examination":{"modality":"US","technique":"COLOR_DOPPLER",
                  "bodySites":["腹股沟区"]}}]""")
                .andExpect(jsonPath("$[0].status").value("MATCHED"))
                .andExpect(jsonPath("$[0].candidates[0].catalogItemId").value(COLOR_DOPPLER))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.resolution").value("MATCHED"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.bodySites[0].code").value("INGUINAL"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.chargePreview.lines[0].catalogItemId").value(ONE_SITE_ITEM));

        match(encounterId, "[{\"type\":\"EXAMINATION\",\"name\":\"腹股沟彩超\"}]")
                .andExpect(jsonPath("$[0].status").value("MATCHED"))
                .andExpect(jsonPath("$[0].candidates[0].catalogItemId").value(COLOR_DOPPLER))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.resolution").value("MATCHED"))
                .andExpect(jsonPath("$[0].candidates[0].examinationSites.bodySites[0].code").value("INGUINAL"));
    }

    private ResultActions match(String encounterId, String intents) throws Exception {
        return mockMvc.perform(post("/api/ai/clinical-assistant/encounters/{id}/treatment-matches", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"intents\":" + intents + "}"))
                .andExpect(status().isOk());
    }

    private long profileRevision(String serviceUrl) throws Exception {
        return json(mockMvc.perform(get(serviceUrl + "/clinical-configuration").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .get("examination").get("revision").asLong();
    }

    private String startedEncounter(String suffix) throws Exception {
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"fullName":"检查意图测试","gender":"2","birthDate":"1980-02-02",
                         "identifiers":[{"system":"9","value":"EXAMAI-%s","useType":"SECONDARY"}]}
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
}
