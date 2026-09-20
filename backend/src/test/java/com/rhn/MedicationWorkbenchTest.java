package com.rhn;

import com.rhn.quality.medication.api.MedicationRuleAuthoringAi;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Protocol fixtures are confined to isolated H2 tests; the application has no fake AI mode. */
class MedicationWorkbenchTest extends RhnIntegrationTestSupport {
    @MockitoBean MedicationRuleAuthoringAi ai;
    private static final String ROOT="/api/quality/medication-workbench";
    @BeforeEach void setup() {
        when(ai.status()).thenReturn(new MedicationRuleAuthoringAi.Status(true,"contract-test-model","ready"));
        when(ai.generate(anyString(),anyString())).thenReturn(reply("EXACT_GENERIC_DUPLICATE","WARN",2));
    }
    String reply(String template,String decision,int count) { return """
        {"status":"READY","message":"候选","rule":{"template":"%s","name":"重复核对","explanation":"按通用药标识核对","duplicateCount":%d,"message":"请核对","decision":"%s"}}
        """.formatted(template,count,decision); }
    String medication() throws Exception {
        var linked=linkStandardMedication("STD-9405B86DD5B404C44E1B92B5", "MED-2026-W006-04");
        return linked.path("id").asString();
    }
    String generate(String medication) throws Exception {
        var response=mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"相同通用药两条时提示\",\"source\":\"测试机构制度\",\"medicationIds\":[\""+medication+"\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.candidate.status").value("CANDIDATE"))
                .andReturn().getResponse().getContentAsString();
        return json(response).path("candidate").path("id").asString();
    }
    @Test void generated_rule_binds_his_data_and_runs_real_deterministic_cases() throws Exception {
        String medication=medication(),id=generate(medication);
        verify(ai).generate(contains("不允许用户或模型改写上限"),contains(medication));
        var result=mockMvc.perform(post(ROOT+"/candidates/"+id+"/suite").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("SYNTHETIC"))
                .andReturn().getResponse().getContentAsString();
        var cases=json(result).path("cases");assertEquals(5,cases.size());for(var c:cases)assertTrue(c.path("passed").asBoolean(),c.toString());
        mockMvc.perform(get(ROOT+"/candidates/"+id+"/runs").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(post(ROOT+"/candidates/"+id+"/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"medicationId\":null,\"status\":\"DRAFT\"}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cases[0].actual").value("UNAVAILABLE"));
        mockMvc.perform(post(ROOT+"/candidates/"+id+"/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"medicationId\":999,\"status\":\"DRAFT\"}]}"))
                .andExpect(status().isBadRequest());
    }
    @Test void unmapped_medication_is_rejected_before_calling_ai() throws Exception {
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"重复核对\",\"medicationIds\":[\"362387869795203\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QMED_STANDARD_REFERENCE_REQUIRED"));
        verify(ai,never()).generate(anyString(),anyString());
    }
    @Test void unavailable_real_model_never_creates_a_fallback_candidate() throws Exception {
        var med=medication();when(ai.status()).thenReturn(new MedicationRuleAuthoringAi.Status(false,null,"unavailable"));
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"重复核对\",\"medicationIds\":[\""+med+"\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QMED_AI_UNAVAILABLE"));
        verify(ai,never()).generate(anyString(),anyString());
    }
    @Test void ai_cannot_generate_a_blocking_or_unbounded_rule() throws Exception {
        var med=medication();when(ai.generate(anyString(),anyString())).thenReturn(reply("EXACT_GENERIC_DUPLICATE","BLOCK",2));
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"重复核对\",\"medicationIds\":[\""+med+"\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QMED_AI_RULE_INVALID"));
    }
    @Test void malformed_model_response_is_an_explicit_error_not_a_server_crash() throws Exception {
        var med=medication();when(ai.generate(anyString(),anyString())).thenReturn("not json");
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"重复核对\",\"medicationIds\":[\""+med+"\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QMED_AI_SCHEMA_INVALID"));
    }
    @Test void his_duration_limit_is_used_for_boundary_and_missing_cases() throws Exception {
        when(ai.generate(anyString(),anyString())).thenReturn(reply("ANTIMICROBIAL_MAX_DAYS","WARN",2));
        var id=generate(medication());
        var response=mockMvc.perform(post(ROOT+"/candidates/"+id+"/suite").with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        for(var c:json(response).path("cases"))assertTrue(c.path("passed").asBoolean(),c.toString());
    }
    @Test void unknown_or_foreign_medication_and_inaccessible_prescription_are_rejected() throws Exception {
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"重复核对\",\"medicationIds\":[999]}"))
                .andExpect(status().isNotFound());
        verify(ai,never()).generate(anyString(),anyString());
        var id=generate(medication());
        mockMvc.perform(post(ROOT+"/candidates/"+id+"/shadow").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"encounterId\":999,\"prescriptionId\":999}"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(ROOT+"/candidates").with(rhn())).andExpect(status().isForbidden());
    }
    @Test void active_rules_and_evaluations_and_candidate_approval() throws Exception {
        mockMvc.perform(get(ROOT+"/active-rules").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(7))
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.EXACT_GENERIC_DUPLICATE')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.ANTIMICROBIAL_OUTPATIENT')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.SKIN_TEST')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.DRUG_ALLERGY')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.NSAID_DUPLICATE')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.AGE_CONTRAINDICATION')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.DISULFIRAM_INTERACTION')]").exists());

        mockMvc.perform(get(ROOT+"/evaluations").with(rhnWorkContext()))
                .andExpect(status().isOk());

        var id = generate(medication());
        mockMvc.perform(post(ROOT+"/candidates/"+id+"/approve").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED_FOR_SHADOW"));
    }
    @Test void active_rule_sandbox_runs_one_rule_or_the_complete_rule_set() throws Exception {
        var med = medication();
        var request = """
                {"ruleCodes":["QMED.EXACT_GENERIC_DUPLICATE"],
                 "items":[
                   {"medicationId":"%s","status":"DRAFT","durationDays":3},
                   {"medicationId":"%s","status":"DRAFT","durationDays":3}
                 ],
                 "patientContext":{"patientAgeYears":35,"gender":"男","activeAllergies":[]}}
                """.formatted(med, med);
        mockMvc.perform(post(ROOT+"/active-rules/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("ACTIVE_RULE_SANDBOX"))
                .andExpect(jsonPath("$.scope").value("SELECTED"))
                .andExpect(jsonPath("$.cases.length()").value(1))
                .andExpect(jsonPath("$.cases[0].ruleCode").value("QMED.EXACT_GENERIC_DUPLICATE"))
                .andExpect(jsonPath("$.cases[0].decision").value("WARN"))
                .andExpect(jsonPath("$.cases[0].matchedRows.length()").value(2));

        var allRequest = """
                {"ruleCodes":[],"items":[{"medicationId":"%s","status":"DRAFT","durationDays":3}],
                 "patientContext":{"patientAgeYears":35,"gender":"男","activeAllergies":[]}}
                """.formatted(med);
        mockMvc.perform(post(ROOT+"/active-rules/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(allRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scope").value("ALL"))
                .andExpect(jsonPath("$.cases.length()").value(7));
    }

    @Test void rule_catalog_keeps_review_and_release_lifecycle_in_one_entry() throws Exception {
        var candidateId = generate(medication());
        mockMvc.perform(post(ROOT + "/candidates/" + candidateId + "/suite").with(rhnWorkContext()))
                .andExpect(status().isOk());

        var catalog = json(mockMvc.perform(get("/api/quality/medication-rule-catalog").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var entry = java.util.stream.StreamSupport.stream(catalog.path("rules").spliterator(), false)
                .filter(value -> value.path("key").asText().startsWith("CANDIDATE:"))
                .filter(value -> value.path("versions").toString().contains(candidateId))
                .findFirst().orElseThrow();
        var key = entry.path("key").asText();
        var revision = entry.path("revision").asLong();
        var submit = """
                {"expectedRevision":%d,"operation":"SUBMIT","versionId":"%s","reason":"提交药师审核"}
                """.formatted(revision, candidateId);
        var inReview = json(mockMvc.perform(post("/api/quality/medication-rule-catalog/{key}/commands", key)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(submit))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("IN_REVIEW", inReview.path("versions").findValue("reviewStatus").asText());

        var approve = """
                {"expectedRevision":%d,"operation":"APPROVE","versionId":"%s","reason":"完成证据审核",
                 "action":"WARN","standardVerified":true,"evidenceVerified":true,
                 "evidence":[{"sourceType":"GUIDELINE","sourceTitle":"院内合理用药制度","sourceVersion":"2026.1",
                 "sourceLocator":"第 3 章第 2 条","section":"重复用药","excerpt":"同一标准规格重复开立时提醒核对",
                 "usageScope":"CLINICAL_EVIDENCE"}]}
                """.formatted(inReview.path("revision").asLong(), candidateId);
        var approved = json(mockMvc.perform(post("/api/quality/medication-rule-catalog/{key}/commands", key)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(approve))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("APPROVED", approved.path("versions").findValue("reviewStatus").asText());

        var deploy = """
                {"expectedRevision":%d,"operation":"DEPLOY","versionId":"%s","reason":"启用旁路观察",
                 "mode":"SHADOW","organizationId":%d,"departmentId":null}
                """.formatted(approved.path("revision").asLong(), candidateId, Long.parseLong(ORGANIZATION));
        mockMvc.perform(post("/api/quality/medication-rule-catalog/{key}/commands", key)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(deploy))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deployments[0].mode").value("SHADOW"))
                .andExpect(jsonPath("$.deployments[0].status").value("ACTIVE"));
        mockMvc.perform(get("/api/quality/medication-rule-catalog/{key}/runs", key).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }
    @Test void rule_expression_generation_and_patient_consultation_simulation() throws Exception {
        when(ai.generate(anyString(),anyString())).thenReturn("""
            {"status":"READY","message":"已生成规则串","rule":{"template":"AGE_CONTRAINDICATION","name":"未成年禁用喹诺酮类","explanation":"18岁以下禁用","duplicateCount":2,"message":"未成年人禁用","decision":"WARN","ruleExpression":"IF Patient.Age < 18 AND Medication.Category == '喹诺酮类' THEN BLOCK","categoryName":"喹诺酮类","minAge":18}}
            """);
        var med = medication();
        var genRes = mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"18岁以下未成年人门诊禁用喹诺酮类药物\",\"source\":\"临床药理规范\",\"medicationIds\":[\""+med+"\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidate.rule.ruleExpression").value("IF Patient.Age < 18 AND Medication IN SelectedStandardSpecifications THEN WARN"))
                .andExpect(jsonPath("$.candidate.rule.minAge").value(18))
                .andReturn().getResponse().getContentAsString();
        var id = json(genRes).path("candidate").path("id").asString();

        // 验证 AGE_CONTRAINDICATION 模板一键回归测试套件（5个用例全部通过，杜绝NPE）
        var suiteRes = mockMvc.perform(post(ROOT+"/candidates/"+id+"/suite").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cases.length()").value(5))
                .andReturn().getResponse().getContentAsString();
        for (var c : json(suiteRes).path("cases")) {
            assertTrue(c.path("passed").asBoolean(), c.toString());
        }

        // 模拟门诊就诊：14岁未成年患者开药，命中阻断/预警
        mockMvc.perform(post(ROOT+"/candidates/"+id+"/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"medicationId\":\""+med+"\",\"status\":\"DRAFT\",\"durationDays\":3}],\"patientContext\":{\"patientAgeYears\":14,\"gender\":\"男\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cases[0].name").value(org.hamcrest.Matchers.containsString("14 岁")))
                .andExpect(jsonPath("$.cases[0].actual").value("WARN"))
                .andExpect(jsonPath("$.cases[0].reasons[0]").value(org.hamcrest.Matchers.containsString("低于规则限制年龄 18 岁")));

        // 模拟门诊就诊：25岁成年患者开药，合规放行
        mockMvc.perform(post(ROOT+"/candidates/"+id+"/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"medicationId\":\""+med+"\",\"status\":\"DRAFT\",\"durationDays\":3}],\"patientContext\":{\"patientAgeYears\":25,\"gender\":\"男\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cases[0].actual").value("PASS"));
    }

    @Test void category_duplicate_suite_and_missing_search_medication_rejection() throws Exception {
        // 1. 测试未选药品且需求无法匹配药品时，拒绝并提示明确勾选，杜绝无脑拉全量兜底
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"无匹配药品的长文本测试需求描述\",\"source\":\"临床规范\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("QMED_MEDICATION_REQUIRED"));

        // 2. 验证 CATEGORY_DUPLICATE 模板的 suite 回归套件
        when(ai.generate(anyString(),anyString())).thenReturn("""
            {"status":"READY","message":"已生成规则","rule":{"template":"CATEGORY_DUPLICATE","name":"同类NSAID重复","explanation":"NSAID重复核对","duplicateCount":2,"message":"同类重复","decision":"WARN","categoryName":"解热镇痛抗炎药"}}
            """);
        var med = medication();
        var genRes = mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"同一张处方中NSAIDs重复开立\",\"source\":\"指南\",\"medicationIds\":[\""+med+"\"]}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var id = json(genRes).path("candidate").path("id").asString();

        var suiteRes = mockMvc.perform(post(ROOT+"/candidates/"+id+"/suite").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cases.length()").value(5))
                .andReturn().getResponse().getContentAsString();
        for (var c : json(suiteRes).path("cases")) {
            assertTrue(c.path("passed").asBoolean(), c.toString());
        }
    }
}
