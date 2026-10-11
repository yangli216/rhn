package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalTriageContracts.*;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.*;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ClinicalTriageDecisionServiceTest {
    private final ClinicalAiRuntimePolicy policy = mock(ClinicalAiRuntimePolicy.class);
    private final DecisionModelGateway gateway = mock(DecisionModelGateway.class);
    private final OutpatientTriageAssessmentDirectory baseline = mock(OutpatientTriageAssessmentDirectory.class);
    private final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    private final JsonCodec json = mock(JsonCodec.class);
    private final ExecutionContext context = new ExecutionContext(1L, 2L, "nurse", "correlation", Set.of(),
            10L, 11L, "ORGANIZATION", Set.of(10L), Set.of(11L), 12L);
    private final ClinicalTriageDecisionService service = new ClinicalTriageDecisionService(policy, gateway, baseline, contexts, json);

    @BeforeEach void setup() {
        when(contexts.requireCurrent()).thenReturn(context);
        when(policy.text(anyLong(), anyString(), anyString())).thenAnswer(call -> call.getArgument(2));
        when(policy.number(anyLong(), anyString(), anyLong())).thenAnswer(call -> call.getArgument(2));
        when(policy.secret(1L, "decision-api-key", null)).thenReturn("independent-key");
        when(policy.booleanValue(1L, DecisionScene.OUTPATIENT_TRIAGE.settingKey(), false)).thenReturn(true);
        var mapper = JsonMapper.builder().build();
        when(json.write(any())).thenAnswer(call -> mapper.writeValueAsString(call.getArgument(0)));
        when(json.readTree(anyString())).thenAnswer(call -> mapper.readTree((String) call.getArgument(0)));
        when(baseline.assess(any())).thenReturn(assessment(List.of(new CandidateDepartment(101L, "内科", 7, true),
                new CandidateDepartment(102L, "全科", 0, false))));
        when(gateway.decide(any(), any())).thenAnswer(call -> result(call.getArgument(0), "DEPARTMENT_102", 0.99, "ASK"));
    }
    private void mode(String mode) { when(policy.text(1L, "decision-mode", "DISABLED")).thenReturn(mode); }
    private static AssessmentRequest input(String complaint) {
        return new AssessmentRequest(complaint, null, null, null, null, null, null, null, null, null, null, 35, "MALE", true);
    }
    private static BaselineAssessment assessment(List<CandidateDepartment> departments) {
        return new BaselineAssessment(new RuleAssessment("LEVEL_1_CRITICAL", "规则", List.of("规则"), List.of("危险")),
                List.of(new OutpatientTriageAssessmentDirectory.DepartmentRecommendation(101L, "内科", 90, "规则", 7, null, true)), departments);
    }
    private static DecisionModelGateway.Result result(DecisionModelGateway.Request request, String choice,
                                                      double confidence, String collection) {
        var answers = new LinkedHashMap<String, DecisionModelGateway.ChoiceAnswer>();
        for (var question : request.questions()) {
            String selected = "department".equals(question.id()) ? choice : collection;
            var distribution = new LinkedHashMap<String, Double>();
            for (String option : question.criteria().keySet()) distribution.put(option, option.equals(selected) ? 1.0 : 0.0);
            answers.put(question.id(), new DecisionModelGateway.ChoiceAnswer(selected, distribution, confidence));
        }
        return new DecisionModelGateway.Result("trace", "jev-test", answers, 25);
    }
    @Test void disabledTotalOrSceneNeverCallsModel() {
        assertThat(service.assess(input("咳嗽")).status()).isEqualTo(DecisionStatus.DISABLED);
        mode("ASSIST");
        when(policy.booleanValue(1L, DecisionScene.OUTPATIENT_TRIAGE.settingKey(), false)).thenReturn(false);
        assertThat(service.assess(input("咳嗽")).status()).isEqualTo(DecisionStatus.DISABLED);
        verifyNoInteractions(gateway, baseline);
    }
    @Test void shadowRecordsComparisonButReturnsNoActionableAdvice() {
        mode("SHADOW");
        var result = service.assess(input("咳嗽"));
        assertThat(result.status()).isEqualTo(DecisionStatus.SHADOW);
        assertThat(result.department()).isNull(); assertThat(result.supplements()).isEmpty();
        assertThat(result.traceId()).isEqualTo("trace"); assertThat(result.inputHash()).hasSize(64);
    }
    @Test void assistReturnsRealDepartmentAndSeparateCollectionPromptsWithoutUrgencyDecision() {
        mode("ASSIST");
        var result = service.assess(input("咳嗽"));
        assertThat(result.status()).isEqualTo(DecisionStatus.ASSIST);
        assertThat(result.department().departmentId()).isEqualTo(102L);
        assertThat(result.department().scheduledToday()).isFalse();
        assertThat(result.department().availableScheduleCount()).isZero();
        assertThat(result.supplements()).hasSize(4);
        verify(gateway).decide(argThat(request -> request.questions().size() == 5
                        && request.questions().stream().noneMatch(question -> question.instructions().contains("四级分诊"))
                        && !request.state().has("patientName") && !request.state().has("encounterId")
                        && request.state().path("consciousness").isNull()
                        && request.questions().getFirst().criteria().containsKey("NONE")),
                argThat(settings -> settings.apiKey().equals("independent-key")));
    }
    @Test void lowConfidenceAndNoMatchDoNotCreateDepartmentAdvice() {
        mode("ASSIST");
        doAnswer(call -> result(call.getArgument(0), "DEPARTMENT_102", 0.5, "ASK")).when(gateway).decide(any(), any());
        var uncertain = service.assess(input("咳嗽"));
        assertThat(uncertain.status()).isEqualTo(DecisionStatus.UNCERTAIN);
        assertThat(uncertain.department()).isNull(); assertThat(uncertain.supplements()).isEmpty();
        doAnswer(call -> result(call.getArgument(0), "NONE", 0.99, "PROVIDED")).when(gateway).decide(any(), any());
        var noMatch = service.assess(input("资料模糊"));
        assertThat(noMatch.department()).isNull(); assertThat(noMatch.supplements()).isEmpty();
    }
    @Test void blankInputAndMissingConfigurationDoNotCallExternalService() {
        mode("ASSIST");
        assertThat(service.assess(input(" ")).status()).isEqualTo(DecisionStatus.NO_INPUT);
        when(policy.secret(1L, "decision-api-key", null)).thenReturn(null);
        assertThat(service.assess(input("咳嗽")).status()).isEqualTo(DecisionStatus.CONFIGURATION_INCOMPLETE);
        verifyNoInteractions(gateway);
    }
    @Test void fabricatedDepartmentOrFailureFallsBackWithoutLeakingProviderDetails() {
        mode("ASSIST");
        doAnswer(call -> result(call.getArgument(0), "DEPARTMENT_999", 0.99, "ASK")).when(gateway).decide(any(), any());
        assertThat(service.assess(input("咳嗽")).status()).isEqualTo(DecisionStatus.FAILED);
        doThrow(new IllegalStateException("secret patient text independent-key")).when(gateway).decide(any(), any());
        var result = service.assess(input("咳嗽"));
        assertThat(result.status()).isEqualTo(DecisionStatus.FAILED);
        assertThat(result.message()).doesNotContain("secret", "independent-key");
    }
    @Test void noLocalDepartmentsStillAllowsCollectionButCannotInventDestination() {
        mode("ASSIST"); when(baseline.assess(any())).thenReturn(assessment(List.of()));
        var result = service.assess(input("咳嗽"));
        assertThat(result.department()).isNull(); assertThat(result.supplements()).hasSize(4);
        verify(gateway).decide(argThat(request -> request.questions().size() == 4), any());
    }
    @Test void oversizedCandidatesSkipModelInsteadOfHidingCandidates() {
        mode("ASSIST");
        when(baseline.assess(any())).thenReturn(assessment(java.util.stream.LongStream.range(1, 66)
                .mapToObj(id -> new CandidateDepartment(id, "科室" + id, 0, false)).toList()));
        assertThat(service.assess(input("咳嗽")).status()).isEqualTo(DecisionStatus.CANDIDATE_LIMIT);
        verifyNoInteractions(gateway);
    }
}
