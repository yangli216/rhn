package com.rhn;

import com.rhn.ai.application.ClinicalAiModelGateway;
import com.rhn.ai.application.ClinicalAiModelException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.util.UUID;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
@TestPropertySource(properties = {
        "rhn.ai.mode=MODEL", "rhn.ai.model=plan-test-model",
        "rhn.ai.endpoint=http://127.0.0.1:9/v1/chat/completions"
})
class ClinicalAiPlanCompilationTest extends RhnIntegrationTestSupport {
    @MockitoBean ClinicalAiModelGateway modelGateway;

    @Test
    void natural_input_is_compiled_to_plan_draft_and_can_be_persisted_as_hospital_plan() throws Exception {
        String narrative = """
                适用范围：原发性高血压门诊管理。
                诊断与评估：核对血压水平及心血管风险。
                治疗方案：核对硝苯地平控释片30mg qd。
                检验检查：完善心电图。
                复诊与转诊：一周后复诊。
                """;
        when(modelGateway.compilePlan(any(), any())).thenReturn(new ClinicalAiModelGateway.PlanIntent(
                "高血压诊疗方案", "依据输入整理的待核对方案", narrative, List.of(
                new ClinicalAiModelGateway.PlanIntentItem("DIAGNOSIS", "原发性高血压", "原发性高血压", "EXPLICIT", null),
                new ClinicalAiModelGateway.PlanIntentItem("EXAMINATION", "心电图", "心电图", "EXPLICIT", null),
                new ClinicalAiModelGateway.PlanIntentItem("MEDICATION", "硝苯地平控释片", "硝苯地平控释片", "EXPLICIT", "30mg qd"),
                new ClinicalAiModelGateway.PlanIntentItem("FOLLOW_UP", "复诊", "复诊", "EXPLICIT", "一周后")), null));
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String name = "AI高血压指南方-" + suffix;

        // 1. Test AI natural language compilation
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "naturalInput": "原发性高血压规范管理方案，开硝苯地平控释片30mg qd，查心电图，一周后复诊",
                                  "scopeType": "HOSPITAL"
                                }
                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeType").value("HOSPITAL"))
                .andExpect(jsonPath("$.sourceType").value("AI_INPUT"))
                .andExpect(jsonPath("$.reviewItems.length()").value(4))
                .andExpect(jsonPath("$.narrative").value(org.hamcrest.Matchers.containsString("治疗方案")));
        String draftJson = mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/convert")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "naturalInput": "原发性高血压规范管理方案，开硝苯地平控释片30mg qd，查心电图，一周后复诊",
                                  "confirmedNarrative": "依据输入整理的待核对方案",
                                  "scopeType": "HOSPITAL"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("I10"))
                .andExpect(jsonPath("$.medications.length()").value(0))
                .andExpect(jsonPath("$.tasks.length()").value(4))
                .andReturn().getResponse().getContentAsString();
        verify(modelGateway, times(2)).compilePlan(argThat(request -> "INPUT".equals(request.mode())
                && request.text().contains("30mg qd")), any());

        JsonNode compiledDraft = json(draftJson);

        // 2. Persist as HOSPITAL template
        String templateId = json(mockMvc.perform(post("/api/outpatient/plan-templates")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "scopeType":"HOSPITAL",
                                  "name":"%s",
                                  "description":"%s",
                                  "sourceType":"AI_INPUT",
                                  "diagnoses":%s,
                                  "medications":[],
                                  "services":[],
                                  "tasks":%s
                                }
                                """.formatted(name, compiledDraft.get("description").asString(),
                                compiledDraft.get("diagnoses").toString(), compiledDraft.get("tasks").toString())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.scopeType").value("HOSPITAL"))
                .andExpect(jsonPath("$.sourceType").value("AI_INPUT"))
                .andExpect(jsonPath("$.tasks.length()").value(4))
                .andReturn().getResponse().getContentAsString()).get("id").asString();

        // 3. Verify it is visible in current context
        mockMvc.perform(get("/api/outpatient/plan-templates").with(rhnWorkContext()).param("keyword", suffix))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(Long.valueOf(templateId)))
                .andExpect(jsonPath("$[0].scopeType").value("HOSPITAL"));

        when(modelGateway.compilePlan(any(), any())).thenReturn(new ClinicalAiModelGateway.PlanIntent(
                "参考已有方案", null, List.of(new ClinicalAiModelGateway.PlanIntentItem(
                "DIAGNOSIS", "原发性高血压", null, "SUGGESTED", null)), Long.valueOf(templateId)));
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/convert")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"naturalInput\":\"参考院内既有方案\",\"scopeType\":\"PERSONAL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses.length()").value(0))
                .andExpect(jsonPath("$.tasks[0].details").value(org.hamcrest.Matchers.containsString(name)));
        verify(modelGateway).compilePlan(argThat(request -> request.availablePlans().stream()
                .anyMatch(plan -> plan.id().equals(Long.valueOf(templateId)))), any());
    }

    @Test
    void plan_preview_streams_real_model_deltas_and_commits_review_items_on_completion() throws Exception {
        when(modelGateway.compilePlanStreaming(any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Consumer<String> onDelta = invocation.getArgument(2);
            onDelta.accept("{\"name\":\"成人上感方案\",\"narrative\":\"诊断与评估：");
            onDelta.accept("上感待核对。\"");
            return new ClinicalAiModelGateway.PlanIntent("成人上感方案", "待核对", "诊断与评估：上感待核对。",
                    List.of(new ClinicalAiModelGateway.PlanIntentItem(
                            "CONDITION", "成人上感", "成人上感", "EXPLICIT", "核对病程")), null);
        });

        String stream = mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/stream")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .content("{\"naturalInput\":\"成人上感常用方案\",\"scopeType\":\"PERSONAL\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        org.junit.jupiter.api.Assertions.assertTrue(stream.contains("event: delta"));
        org.junit.jupiter.api.Assertions.assertTrue(stream.contains("event: complete"));
        org.junit.jupiter.api.Assertions.assertTrue(stream.contains("reviewItems"));
        org.junit.jupiter.api.Assertions.assertTrue(stream.contains("成人上感"));
    }

    @Test
    void plan_preview_revision_sends_current_draft_and_doctor_instruction_to_the_model() throws Exception {
        when(modelGateway.compilePlanStreaming(any(), any(), any())).thenReturn(new ClinicalAiModelGateway.PlanIntent(
                "修订后的上感方案", "已按医生要求修订", "诊断与评估：急性上呼吸道感染。",
                List.of(new ClinicalAiModelGateway.PlanIntentItem(
                        "DIAGNOSIS", "急性上呼吸道感染，未特指", "成人感冒方案", "EXPLICIT", "核对门诊表现")), null));

        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/stream")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .content("""
                                {
                                  "naturalInput":"成人感冒方案",
                                  "confirmedNarrative":"上一版包含血常规",
                                  "revisionInstruction":"删除血常规并使用标准诊断名称",
                                  "scopeType":"PERSONAL"
                                }
                                """))
                .andExpect(status().isOk());

        verify(modelGateway).compilePlanStreaming(argThat(request ->
                "上一版包含血常规".equals(request.currentNarrative())
                        && "删除血常规并使用标准诊断名称".equals(request.revisionInstruction())), any(), any());
    }

    @Test
    void plan_preview_only_marks_terminology_matched_diagnoses_as_icd10() throws Exception {
        when(modelGateway.compilePlan(any(), any())).thenReturn(new ClinicalAiModelGateway.PlanIntent(
                "成人上感方案", "待医生审核", "诊断与评估：急性上呼吸道感染；成人风寒感冒待明确。",
                List.of(
                        new ClinicalAiModelGateway.PlanIntentItem(
                                "DIAGNOSIS", "急性上呼吸道感染，未特指", "急性上呼吸道感染", "EXPLICIT", null),
                        new ClinicalAiModelGateway.PlanIntentItem(
                                "DIAGNOSIS", "成人风寒感冒", "成人风寒感冒", "EXPLICIT", null)), null));

        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"naturalInput\":\"急性上呼吸道感染，成人风寒感冒\",\"scopeType\":\"PERSONAL\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reviewItems[0].kind").value("DIAGNOSIS"))
                .andExpect(jsonPath("$.reviewItems[0].text").value("急性上呼吸道感染，未特指 [J06.9]"))
                .andExpect(jsonPath("$.reviewItems[1].kind").value("CONDITION"))
                .andExpect(jsonPath("$.reviewItems[1].details").value(
                        org.hamcrest.Matchers.containsString("尚未匹配院内 ICD-10 术语")));
    }

    @Test
    void reviewed_items_are_converted_without_restoring_removed_model_suggestions() throws Exception {
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/convert")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "naturalInput":"成人风寒感冒方案",
                                  "confirmedNarrative":"诊断与评估：急性上呼吸道感染；三天后复诊。",
                                  "confirmedName":"成人上感常用方案",
                                  "scopeType":"PERSONAL",
                                  "reviewItems":[
                                    {
                                      "kind":"DIAGNOSIS",
                                      "text":"急性上呼吸道感染，未特指 [J06.9]",
                                      "sourceQuote":"成人风寒感冒",
                                      "origin":"EXPLICIT"
                                    },
                                    {
                                      "kind":"FOLLOW_UP",
                                      "text":"三天后复诊",
                                      "origin":"SUGGESTED",
                                      "details":"症状未缓解或加重时"
                                    }
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("成人上感常用方案"))
                .andExpect(jsonPath("$.diagnoses[0].code").value("J06.9"))
                .andExpect(jsonPath("$.tasks.length()").value(2))
                .andExpect(jsonPath("$.tasks[0].kind").value("DIAGNOSIS"))
                .andExpect(jsonPath("$.tasks[1].kind").value("FOLLOW_UP"));
        verifyNoInteractions(modelGateway);
    }

    @Test
    void doctor_confirmed_items_with_imperfect_model_evidence_are_downgraded_instead_of_rejecting_the_plan() throws Exception {
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/convert")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "naturalInput":"急性上感对症",
                                  "confirmedNarrative":"诊断与评估：急性上呼吸道感染。治疗方案：发热疼痛时可考虑对乙酰氨基酚。",
                                  "confirmedName":"急性上呼吸道感染对症方案",
                                  "scopeType":"PERSONAL",
                                  "reviewItems":[
                                    {"kind":"DIAGNOSIS","text":"急性上呼吸道感染，未特指 [J06.9]","sourceQuote":"急性上感","origin":"EXPLICIT"},
                                    {"kind":"MEDICATION","text":"对乙酰氨基酚","sourceQuote":"急性上感对症","origin":"EXPLICIT","details":"发热疼痛时考虑"}
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("J06.9"))
                .andExpect(jsonPath("$.medications[0].catalogItemId").value(362387871000301L))
                .andExpect(jsonPath("$.tasks[0].origin").value("EXPLICIT"))
                .andExpect(jsonPath("$.tasks[1].origin").value("SUGGESTED"))
                .andExpect(jsonPath("$.tasks[1].sourceQuote").doesNotExist())
                .andExpect(jsonPath("$.tasks[1].details").value(
                        org.hamcrest.Matchers.containsString("按医生确认候选处理")));
        verifyNoInteractions(modelGateway);
    }

    @Test
    void doctor_confirmed_ai_suggestions_match_and_persist_as_system_recognizable_catalog_entries() throws Exception {
        String compiledJson = mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/convert")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "naturalInput":"成人急性上呼吸道感染常用方案",
                                  "confirmedNarrative":"诊断急性上呼吸道感染，发热疼痛时考虑对乙酰氨基酚，必要时查血常规。",
                                  "confirmedName":"成人上感目录匹配方案",
                                  "scopeType":"PERSONAL",
                                  "reviewItems":[
                                    {"kind":"DIAGNOSIS","text":"急性上呼吸道感染，未特指 [J06.9]","origin":"SUGGESTED"},
                                    {"kind":"MEDICATION","text":"对乙酰氨基酚","origin":"SUGGESTED","details":"发热或疼痛时考虑"},
                                    {"kind":"LABORATORY","text":"血常规","origin":"SUGGESTED","details":"高热持续时考虑"}
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("J06.9"))
                .andExpect(jsonPath("$.medications.length()").value(1))
                .andExpect(jsonPath("$.medications[0].medicationId").value(362387871000901L))
                .andExpect(jsonPath("$.medications[0].catalogItemId").value(362387871000301L))
                .andExpect(jsonPath("$.medications[0].packageId").value(362387871000601L))
                .andExpect(jsonPath("$.medications[0].doseValue").value(0.5))
                .andExpect(jsonPath("$.medications[0].routeCode").value("ORAL"))
                .andExpect(jsonPath("$.medications[0].frequencyCode").value("PRN"))
                .andExpect(jsonPath("$.medications[0].durationValue").doesNotExist())
                .andExpect(jsonPath("$.services.length()").value(1))
                .andExpect(jsonPath("$.services[0].catalogItemId").value(362387869795101L))
                .andExpect(jsonPath("$.services[0].itemName").value("血细胞分析"))
                .andExpect(jsonPath("$.tasks[0].status").value("MATCHED"))
                .andExpect(jsonPath("$.tasks[1].status").value("MATCHED"))
                .andExpect(jsonPath("$.tasks[2].status").value("MATCHED"))
                .andReturn().getResponse().getContentAsString();

        JsonNode compiled = json(compiledJson);
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        var saveBody = objectMapper.createObjectNode();
        saveBody.put("scopeType", "PERSONAL");
        saveBody.put("name", "AI目录方案-" + suffix);
        saveBody.put("description", compiled.path("description").asString());
        saveBody.put("sourceType", "AI_INPUT");
        saveBody.set("diagnoses", compiled.path("diagnoses"));
        saveBody.set("medications", compiled.path("medications"));
        saveBody.set("services", compiled.path("services"));
        saveBody.set("tasks", compiled.path("tasks"));

        mockMvc.perform(post("/api/outpatient/plan-templates")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(saveBody.toString()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.diagnoses[0].code").value("J06.9"))
                .andExpect(jsonPath("$.medications[0].catalogItemId").value(362387871000301L))
                .andExpect(jsonPath("$.services[0].catalogItemId").value(362387869795101L));
        verifyNoInteractions(modelGateway);
    }

    @Test
    void unmatched_confirmed_catalog_candidates_are_not_silently_selected() throws Exception {
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/convert")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "naturalInput":"自定义方案",
                                  "confirmedName":"未匹配目录方案",
                                  "scopeType":"PERSONAL",
                                  "reviewItems":[
                                    {"kind":"MEDICATION","text":"不存在的通用药品","origin":"SUGGESTED"},
                                    {"kind":"EXAMINATION","text":"不存在的检查项目","origin":"SUGGESTED"}
                                  ]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.medications.length()").value(0))
                .andExpect(jsonPath("$.services.length()").value(0))
                .andExpect(jsonPath("$.tasks[0].status").value("UNMATCHED"))
                .andExpect(jsonPath("$.tasks[1].status").value("UNMATCHED"));
        verifyNoInteractions(modelGateway);
    }

    @Test
    void primary_care_upper_respiratory_infection_plan_compiles_and_persists_without_invalid_codes() throws Exception {
        when(modelGateway.compilePlan(any(), any())).thenReturn(new ClinicalAiModelGateway.PlanIntent(
                "上呼吸道感染方案", null, List.of(new ClinicalAiModelGateway.PlanIntentItem(
                "DIAGNOSIS", "急性上呼吸道感染，未特指", "成人风寒感冒推荐方案", "EXPLICIT", null))));
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String name = "基层成人上感常用方案-" + suffix;

        // 1. Verify compilation maps correctly to J06.9 instead of invalid Z00.0
        String draftJson = mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/convert")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "naturalInput": "成人风寒感冒推荐方案",
                                  "scopeType": "PERSONAL"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sourceType").value("AI_INPUT"))
                .andExpect(jsonPath("$.diagnoses[0].code").value("J06.9"))
                .andExpect(jsonPath("$.diagnoses[0].display").value("急性上呼吸道感染，未特指"))
                .andReturn().getResponse().getContentAsString();

        JsonNode compiledDraft = json(draftJson);

        // 2. Persist to outpatient plan template repository (verifies real ICD-10 term check passes!)
        mockMvc.perform(post("/api/outpatient/plan-templates")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "scopeType":"PERSONAL",
                                  "name":"%s",
                                  "description":"%s",
                                  "sourceType":"AI_INPUT",
                                  "diagnoses":%s,
                                  "medications":[],
                                  "services":[]
                                }
                                """.formatted(name, compiledDraft.get("description").asString(),
                                compiledDraft.get("diagnoses").toString())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.diagnoses[0].code").value("J06.9"));
    }

    @Test
    void guideline_text_is_compiled_with_metadata_and_mined_suggestions_work() throws Exception {
        when(modelGateway.compilePlan(any(), any())).thenReturn(new ClinicalAiModelGateway.PlanIntent(
                "高血压诊疗条文", null,
                "适用范围：原发性高血压。\n诊断与评估：按所粘贴条文进行评估。",
                List.of(new ClinicalAiModelGateway.PlanIntentItem(
                "DIAGNOSIS", "原发性高血压", "原发性高血压", "EXPLICIT", null)), null));
        // 1. Compile guideline text
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/guideline-extract")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "guidelineText": "原发性高血压患者的诊疗推荐条文",
                                  "guidelineName": "中国高血压防治指南2026",
                                  "versionYear": "2026",
                                  "scopeType": "HOSPITAL"
                                }
                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scopeType").value("HOSPITAL"))
                .andExpect(jsonPath("$.sourceType").value("AI_GUIDELINE"))
                .andExpect(jsonPath("$.name").value("中国高血压防治指南2026"))
                .andExpect(jsonPath("$.guidelineReference").isString())
                .andExpect(jsonPath("$.narrative").value(org.hamcrest.Matchers.containsString("原发性高血压")));
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/guideline-extract/convert")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "guidelineText": "原发性高血压患者的诊疗推荐条文",
                                  "guidelineName": "中国高血压防治指南2026",
                                  "versionYear": "2026",
                                  "confirmedNarrative": "高血压诊疗条文",
                                  "scopeType": "HOSPITAL"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("I10"));
        verify(modelGateway, times(2)).compilePlan(argThat(request -> "GUIDELINE".equals(request.mode())), any());

        // 2. Test mining personal plan suggestions
        mockMvc.perform(get("/api/ai/clinical-assistant/plan-templates/mined-suggestions")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void invalid_model_evidence_or_provider_failure_never_falls_back_to_a_diagnosis() throws Exception {
        when(modelGateway.compilePlan(any(), any())).thenReturn(new ClinicalAiModelGateway.PlanIntent(
                "不可信结果", null, List.of(new ClinicalAiModelGateway.PlanIntentItem(
                "DIAGNOSIS", "原发性高血压", "未在输入中的引文", "EXPLICIT", null))));
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/convert")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"naturalInput\":\"请记录随访\",\"scopeType\":\"PERSONAL\"}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("AI_PLAN_RESPONSE_INVALID"));

        when(modelGateway.compilePlan(any(), any())).thenThrow(new ClinicalAiModelException(
                ClinicalAiModelException.Reason.TIMEOUT, null, "provider secret", null));
        mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"naturalInput\":\"请记录随访\",\"scopeType\":\"PERSONAL\"}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("AI_PLAN_MODEL_UNAVAILABLE"));
    }

    @Test
    void historical_stable_plan_endpoint_handles_encounter() throws Exception {
        String encounterId = createStartedEncounter();

        mockMvc.perform(get("/api/ai/clinical-assistant/encounters/{encounterId}/historical-stable-plan", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk());
    }

    private String createStartedEncounter() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        JsonNode resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"方案编译测试居民",
                                  "identifiers":[{"system":"9","value":"PLAN%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1988-08-08"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "residentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "idempotencyCode":"PLAN-REG-%s"
                                }
                                """.formatted(resident.get("id").asString(), ORGANIZATION, DEPARTMENT, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String encounterId = encounter.get("id").asString();
        mockMvc.perform(verifiedEncounterStart(encounterId)).andExpect(status().isOk());
        return encounterId;
    }
}
