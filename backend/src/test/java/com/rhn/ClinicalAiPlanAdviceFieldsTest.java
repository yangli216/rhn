package com.rhn;

import com.rhn.ai.application.ClinicalAiModelGateway;
import com.rhn.ai.application.DecisionModelGateway;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Plan items as the model writes them: advice fields (目的/适用条件/嘱托) must not block the real catalog match. */
@TestPropertySource(properties = {"rhn.ai.mode=MODEL", "rhn.ai.model=plan-test-model",
        "rhn.ai.endpoint=http://127.0.0.1:9/v1/chat/completions"})
class ClinicalAiPlanAdviceFieldsTest extends RhnIntegrationTestSupport {
    @MockitoBean ClinicalAiModelGateway modelGateway;
    @MockitoBean DecisionModelGateway decisionGateway;

    private void convert(Map<String, String> item, String status, String detailsFragment) throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("naturalInput", "急性上呼吸道感染",
                "confirmedNarrative", "急性上呼吸道感染", "confirmedName", "建议字段核对", "scopeType", "PERSONAL",
                "reviewItems", List.of(item)));
        var result = mockMvc.perform(post("/api/ai/clinical-assistant/plan-templates/draft/convert").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.tasks[0].status").value(status));
        if (detailsFragment != null) result.andExpect(jsonPath("$.tasks[0].details").value(containsString(detailsFragment)));
    }

    @Test void conditionalWordingInAdviceFieldsDoesNotBlockALaboratoryOrExaminationMatch() throws Exception {
        convert(Map.of("kind", "LABORATORY", "text", "血常规", "origin", "SUGGESTED",
                "details", "目的：评估感染；适用条件：发热；不建议常规使用：无发热的单纯咽痛"), "MATCHED", "默认 1");
        convert(Map.of("kind", "EXAMINATION", "text", "胸部X线摄片", "origin", "SUGGESTED",
                "details", "目的：排除肺炎；适用条件：持续咳嗽"), "MATCHED", "别名匹配院内目录");
    }

    @Test void conditionalWordingInTheOrderItselfIsKeptForTheDoctorAndStillMatches() throws Exception {
        convert(Map.of("kind", "LABORATORY", "text", "血常规", "origin", "SUGGESTED",
                "details", "必要时复查；目的：评估感染"), "MATCHED", "默认 1");
    }

    @Test void eveningOnceIsAlignedToTheDailyOnceEntryWithANoteForTheDoctor() throws Exception {
        convert(Map.of("kind", "MEDICATION", "text", "氯苯那敏片", "origin", "SUGGESTED",
                "details", "规格：4mg/片；常规用法：每次 4mg 口服 每晚1次 疗程 3 天；目的：缓解鼻塞流涕；嘱托：服药后可能嗜睡，避免驾驶或高空作业"),
                "MATCHED", "已按“每日一次”对齐");
    }
}
