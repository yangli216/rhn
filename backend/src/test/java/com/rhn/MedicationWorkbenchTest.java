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
    }
    String medication() throws Exception {
        var linked=linkStandardMedication("STD-9405B86DD5B404C44E1B92B5", "MED-2026-W006-04");
        return linked.path("id").asString();
    }
    /** Legacy candidate versions are created through the catalog draft entry (the AI generator no longer exists). */
    String draft(String medication,String ruleJson) throws Exception {
        var response=mockMvc.perform(post("/api/quality/medication-rule-catalog/drafts").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"相同通用药两条时提示\",\"source\":\"测试机构制度\",\"medicationIds\":["+medication+"],\"rule\":"+ruleJson+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANDIDATE"))
                .andReturn().getResponse().getContentAsString();
        return json(response).path("id").asString();
    }
    static final String DUPLICATE_RULE="{\"template\":\"EXACT_GENERIC_DUPLICATE\",\"name\":\"重复核对\",\"explanation\":\"按通用药标识核对\",\"duplicateCount\":2,\"message\":\"请核对\",\"decision\":\"WARN\"}";
    @Test void active_rules_and_evaluations_are_listed() throws Exception {
        mockMvc.perform(get(ROOT+"/active-rules").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(14))
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.EXACT_GENERIC_DUPLICATE')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.ANTIMICROBIAL_OUTPATIENT')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.SKIN_TEST')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.DRUG_ALLERGY')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.NSAID_DUPLICATE')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.AGE_CONTRAINDICATION')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.DISULFIRAM_INTERACTION')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.PPI_DUPLICATE')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.RASI_DUPLICATE')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.SEDATIVE_HYPNOTIC_DUPLICATE')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.TETRACYCLINE_PEDIATRIC')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.AMINOGLYCOSIDE_PEDIATRIC')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.MACROLIDE_STATIN_INTERACTION')]").exists())
                .andExpect(jsonPath("$[?(@.ruleCode=='QMED.PREGNANCY_CONTRA')]").exists());

        mockMvc.perform(get(ROOT+"/evaluations").with(rhnWorkContext()))
                .andExpect(status().isOk());
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
                .andExpect(jsonPath("$.cases.length()").value(14));
    }

    @Test void rule_catalog_keeps_review_and_release_lifecycle_in_one_entry() throws Exception {
        var candidateId = draft(medication(), DUPLICATE_RULE);
        mockMvc.perform(post(ROOT + "/candidates/" + candidateId + "/suite").with(rhnWorkContext()))
                .andExpect(status().isOk());

        var catalog = json(mockMvc.perform(get("/api/quality/medication-rule-catalog").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var entry = java.util.stream.StreamSupport.stream(catalog.path("rules").spliterator(), false)
                .filter(value -> value.path("key").asString().startsWith("CANDIDATE:"))
                .filter(value -> value.path("versions").toString().contains(candidateId))
                .findFirst().orElseThrow();
        var key = entry.path("key").asString();
        var revision = entry.path("revision").asLong();
        var submit = """
                {"expectedRevision":%d,"operation":"SUBMIT","versionId":"%s","reason":"提交药师审核"}
                """.formatted(revision, candidateId);
        var inReview = json(mockMvc.perform(post("/api/quality/medication-rule-catalog/{key}/commands", key)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(submit))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals("IN_REVIEW", inReview.path("versions").findValue("reviewStatus").asString());

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
        assertEquals("APPROVED", approved.path("versions").findValue("reviewStatus").asString());

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
    @Test void age_contraindication_draft_runs_a_complete_regression_suite() throws Exception {
        var id = draft(medication(), "{\"template\":\"AGE_CONTRAINDICATION\",\"name\":\"未成年禁用喹诺酮类\",\"explanation\":\"18岁以下禁用\",\"duplicateCount\":2,\"message\":\"未成年人禁用\",\"decision\":\"WARN\",\"minAge\":18}");
        var suiteRes = mockMvc.perform(post(ROOT+"/candidates/"+id+"/suite").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cases.length()").value(5))
                .andReturn().getResponse().getContentAsString();
        for (var c : json(suiteRes).path("cases")) {
            assertTrue(c.path("passed").asBoolean(), c.toString());
        }
    }

    @Test void category_duplicate_draft_runs_a_complete_regression_suite() throws Exception {
        var id = draft(medication(), "{\"template\":\"CATEGORY_DUPLICATE\",\"name\":\"同类NSAID重复\",\"explanation\":\"NSAID重复核对\",\"duplicateCount\":2,\"message\":\"同类重复\",\"decision\":\"WARN\",\"categoryName\":\"解热镇痛抗炎药\"}");
        var suiteRes = mockMvc.perform(post(ROOT+"/candidates/"+id+"/suite").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cases.length()").value(5))
                .andReturn().getResponse().getContentAsString();
        for (var c : json(suiteRes).path("cases")) {
            assertTrue(c.path("passed").asBoolean(), c.toString());
        }
    }

    @Test void child_age_contraindication_only_intercepts_target_category_and_passes_unrelated_drugs() throws Exception {
        var amoxicillin = medication(); // 阿莫西林胶囊
        var levofloxacin = "362387880000128"; // 左氧氟沙星片

        // 1. 在行规则沙箱：14岁儿童开具非喹诺酮类（阿莫西林），AGE_CONTRAINDICATION 必须 PASS（不拦截）
        var amoxRequest = """
                {"ruleCodes":["QMED.AGE_CONTRAINDICATION"],
                 "items":[{"medicationId":"%s","status":"DRAFT","durationDays":3}],
                 "patientContext":{"patientAgeYears":14,"gender":"男","activeAllergies":[]}}
                """.formatted(amoxicillin);
        mockMvc.perform(post(ROOT+"/active-rules/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(amoxRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cases[0].decision").value("PASS"));

        // 2. 在行规则沙箱：14岁儿童开具全身性喹诺酮（左氧氟沙星片），AGE_CONTRAINDICATION 动态阻断
        var levoRequest = """
                {"ruleCodes":["QMED.AGE_CONTRAINDICATION"],
                 "items":[{"medicationId":"%s","status":"DRAFT","durationDays":3}],
                 "patientContext":{"patientAgeYears":14,"gender":"男","activeAllergies":[]}}
                """.formatted(levofloxacin);
        mockMvc.perform(post(ROOT+"/active-rules/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(levoRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cases[0].decision").value("BLOCK"))
                .andExpect(jsonPath("$.cases[0].matchedRows[0]").value(1));

        // 3. 在行规则沙箱：混合处方（第1行阿莫西林，第2行左氧氟沙星），必须精准命中第2行，不误伤第1行
        var mixedRequest = """
                {"ruleCodes":["QMED.AGE_CONTRAINDICATION"],
                 "items":[
                   {"medicationId":"%s","status":"DRAFT","durationDays":3},
                   {"medicationId":"%s","status":"DRAFT","durationDays":3}
                 ],
                 "patientContext":{"patientAgeYears":14,"gender":"男","activeAllergies":[]}}
                """.formatted(amoxicillin, levofloxacin);
        mockMvc.perform(post(ROOT+"/active-rules/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(mixedRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cases[0].decision").value("BLOCK"))
                .andExpect(jsonPath("$.cases[0].matchedRows.length()").value(1))
                .andExpect(jsonPath("$.cases[0].matchedRows[0]").value(2));
    }
}
