package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalTriageContracts.AssessmentRequest;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.BaselineAssessment;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.CandidateDepartment;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.DepartmentRecommendation;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.RuleAssessment;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ClinicalTriageAssessmentServiceTest {
    private final OutpatientTriageAssessmentDirectory baselineDirectory = mock(OutpatientTriageAssessmentDirectory.class);
    private final ClinicalAiRuntimePolicy runtimePolicy = mock(ClinicalAiRuntimePolicy.class);
    private final ClinicalTriageAiGateway gateway = mock(ClinicalTriageAiGateway.class);
    private final ExecutionContextProvider contextProvider = mock(ExecutionContextProvider.class);
    private final ExecutionContext context = new ExecutionContext(1L, 2L, "nurse", "trace", Set.of(),
            10L, 11L, "ORGANIZATION", Set.of(10L), Set.of(11L), 12L);
    private ClinicalTriageAssessmentService service;

    @BeforeEach
    void setUp() {
        when(contextProvider.requireCurrent()).thenReturn(context);
        when(baselineDirectory.assess(any())).thenReturn(new BaselineAssessment(
                new RuleAssessment("LEVEL_1_CRITICAL", "收缩压达到危急阈值",
                        List.of("收缩压达到危急阈值"), List.of("收缩压严重异常")),
                List.of(new DepartmentRecommendation(101L, "内科门诊", 94, "存在心血管相关表现", 7,
                        null, true)),
                List.of(new CandidateDepartment(101L, "内科门诊", 7, true),
                        new CandidateDepartment(102L, "全科门诊", 12, true))));
        service = new ClinicalTriageAssessmentService(baselineDirectory, runtimePolicy, gateway, contextProvider);
    }

    @Test
    void disabledModeKeepsBaselineAvailableWithoutModelCall() {
        when(runtimePolicy.current(context)).thenReturn(settings("DISABLED"));

        var result = service.assess(request(true));

        assertThat(result.aiMode()).isEqualTo("DISABLED");
        assertThat(result.source()).isEqualTo("RULE");
        assertThat(result.suggestedLevel()).isEqualTo("LEVEL_1_CRITICAL");
        assertThat(result.departmentRecommendations()).isNotEmpty();
        verify(gateway, never()).assess(any(), any());
    }

    @Test
    void localAssistUsesBaselineDirectoryWithoutModelCall() {
        when(runtimePolicy.current(context)).thenReturn(settings("LOCAL_ASSIST"));

        var result = service.assess(request(true));

        assertThat(result.source()).isEqualTo("LOCAL_ASSIST");
        assertThat(result.departmentRecommendations().getFirst().departmentId()).isEqualTo(101L);
        assertThat(result.departmentRecommendations().getFirst().availableScheduleCount()).isEqualTo(7);
        verify(gateway, never()).assess(any(), any());
    }

    @Test
    void modelMayEnhanceButCannotLowerRuleUrgency() {
        when(runtimePolicy.current(context)).thenReturn(settings("MODEL"));
        when(gateway.assess(any(), any())).thenReturn(new ClinicalTriageAiGateway.Result(
                "LEVEL_4_NON_URGENT", "模型补充评估", List.of("需核对胸痛"),
                List.of(new ClinicalTriageAiGateway.DepartmentRank(101L, 98, "优先内科评估", null))));

        var result = service.assess(request(true));

        assertThat(result.ruleLevel()).isEqualTo("LEVEL_1_CRITICAL");
        assertThat(result.suggestedLevel()).isEqualTo("LEVEL_1_CRITICAL");
        assertThat(result.aiApplied()).isTrue();
        assertThat(result.source()).isEqualTo("AI_ENHANCED");
        assertThat(result.departmentRecommendations().getFirst().source()).isEqualTo("AI");
    }

    @Test
    void modelFailureReturnsSuccessfulRuleFallback() {
        when(runtimePolicy.current(context)).thenReturn(settings("MODEL"));
        when(gateway.assess(any(), any())).thenThrow(new ClinicalAiModelException(
                ClinicalAiModelException.Reason.TIMEOUT, null, "timeout", null));

        var result = service.assess(request(true));

        assertThat(result.source()).isEqualTo("AI_FALLBACK");
        assertThat(result.aiApplied()).isFalse();
        assertThat(result.suggestedLevel()).isEqualTo(result.ruleLevel());
        assertThat(result.fallbackReason()).contains("超时");
    }

    @Test
    void fastBaselineRequestSkipsModelEvenInModelMode() {
        when(runtimePolicy.current(context)).thenReturn(settings("MODEL"));

        var result = service.assess(request(false));

        assertThat(result.source()).isEqualTo("RULE");
        verify(gateway, never()).assess(any(), any());
    }

    private static AssessmentRequest request(boolean aiEnhancement) {
        return new AssessmentRequest("发热咳嗽", "发热,咳嗽", BigDecimal.valueOf(38.6),
                BigDecimal.valueOf(90), BigDecimal.valueOf(18), BigDecimal.valueOf(190),
                BigDecimal.valueOf(80), BigDecimal.valueOf(98), null, 2, "ALERT", 35, "MALE", aiEnhancement);
    }

    private static ClinicalAssistantSettings settings(String mode) {
        boolean model = "MODEL".equals(mode);
        return new ClinicalAssistantSettings(mode, model ? "test" : mode.toLowerCase(), model ? "model" : null,
                Duration.ofMinutes(30), model ? "http://localhost/model" : null, null, Duration.ofSeconds(1),
                1200, null, null, 1024, null, null, 5);
    }
}
