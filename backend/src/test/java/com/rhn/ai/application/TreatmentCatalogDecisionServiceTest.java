package com.rhn.ai.application;

import com.rhn.ai.application.DecisionModelGateway;
import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentRecommendation;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

class TreatmentCatalogDecisionServiceTest {
    final ClinicalAiRuntimePolicy policy = mock(ClinicalAiRuntimePolicy.class);
    final DecisionModelGateway gateway = mock(DecisionModelGateway.class);
    final JsonCodec json = mock(JsonCodec.class);
    final TreatmentCatalogDecisionService service = new TreatmentCatalogDecisionService(policy, gateway, json);
    final ExecutionContext context = new ExecutionContext(1L, 2L, "doctor", "test", Set.of(), 3L, 4L, "DEPARTMENT", Set.of(), Set.of());
    final TreatmentRecommendation intent = new TreatmentRecommendation("LABORATORY", null, null, null, "血常规检查", null, "患者病情不可外发");
    final TreatmentRecommendation candidate = new TreatmentRecommendation("LABORATORY", 101L, null, "LAB001", "血常规", null, "患者病情不可外发");
    final List<TreatmentCatalogDecisionService.Group> groups = List.of(new TreatmentCatalogDecisionService.Group(intent, List.of(candidate)));

    @BeforeEach void setup() {
        when(policy.booleanValue(anyLong(), anyString(), anyBoolean())).thenAnswer(call -> call.getArgument(2));
        var mapper = JsonMapper.builder().build();
        when(json.write(any())).thenAnswer(call -> mapper.writeValueAsString(call.getArgument(0)));
        when(json.readTree(anyString())).thenAnswer(call -> mapper.readTree((String) call.getArgument(0)));
        when(policy.text(anyLong(), anyString(), anyString())).thenAnswer(call -> call.getArgument(2));
        when(policy.number(anyLong(), anyString(), anyLong())).thenAnswer(call -> call.getArgument(2));
        when(policy.secret(1L, "decision-api-key", null)).thenReturn("independent-test-key");
    }
    void mode(String mode) { when(policy.text(1L, "decision-mode", "DISABLED")).thenReturn(mode); }
    void answer(String choice, double confidence) {
        when(gateway.decide(any(), any())).thenReturn(new DecisionModelGateway.Result("trace", "jev-1.13.0",
                Map.of("intent_0", new DecisionModelGateway.ChoiceAnswer(choice,
                    Map.of("LABORATORY|101", "NONE".equals(choice) ? 0.05 : 0.95,
                            "NONE", "NONE".equals(choice) ? 0.95 : 0.05), confidence)), 10));
    }
    @Test void disabledMakesNoExternalCall() {
        assertFalse(service.match(groups, context).applied());
        verifyNoInteractions(gateway);
    }
    @Test void logsDisabledAndFailureReasonWithoutLeakingProviderMessages() {
        var logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(TreatmentCatalogDecisionService.class);
        var appender = new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
        appender.start(); logger.addAppender(appender);
        try {
            service.match(groups, context);
            mode("ASSIST");
            when(gateway.decide(any(), any())).thenThrow(new IllegalStateException("independent-test-key secret patient"));
            service.match(groups, context);
            String messages = appender.list.stream().map(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage)
                    .collect(java.util.stream.Collectors.joining("\n"));
            assertTrue(messages.contains("correlationId=test"));
            assertTrue(messages.contains("outcome=MODE_DISABLED"));
            assertTrue(messages.contains("outcome=DECISION_FAILED"));
            assertTrue(messages.contains("exceptionType=IllegalStateException"));
            assertFalse(messages.contains("independent-test-key"));
            assertFalse(messages.contains("secret patient"));
        } finally { logger.detachAppender(appender); appender.stop(); }
    }
    @Test void sceneGatePreventsCallsEvenWithSharedAssistEnabled() {
        mode("ASSIST");
        when(policy.booleanValue(1L, DecisionScene.ASSISTANT_RECOMMENDATIONS.settingKey(), true)).thenReturn(false);
        assertFalse(service.match(groups, context).applied());
        assertFalse(service.match(groups, context, DecisionScene.PLAN_COMPILATION).applied());
        verifyNoInteractions(gateway);
    }
    @Test void enabledPlanSceneUsesSharedSettingsAndIdentifiesTheScene() {
        mode("ASSIST"); answer("LABORATORY|101", 0.99);
        when(policy.booleanValue(1L, DecisionScene.PLAN_COMPILATION.settingKey(), false)).thenReturn(true);
        assertTrue(service.match(groups, context, DecisionScene.PLAN_COMPILATION).applied());
        verify(gateway).decide(argThat(input -> input.version().contains("PLAN_COMPILATION")),
                argThat(settings -> settings.model().equals("jev-1.13.0") && settings.apiKey().equals("independent-test-key")));
    }
    @Test void shadowRetainsOriginalWorkflowAndSendsOnlyCatalogFields() {
        mode("SHADOW"); answer("LABORATORY|101", 0.99);
        var result = service.match(groups, context);
        assertFalse(result.applied()); assertTrue(result.shadow()); assertEquals(List.of(candidate), result.items());
        assertEquals("SHADOW", result.mode()); assertEquals(.9, result.threshold());
        verify(gateway).decide(argThat(input -> !input.state().toString().contains("患者病情")
                && !input.questions().toString().contains("患者病情")
                && input.questions().getFirst().criteria().containsKey("NONE")), any());
    }
    @Test void assistUsesAcceptedMatch() {
        mode("ASSIST"); answer("LABORATORY|101", 0.99);
        assertTrue(service.match(groups, context).applied());
    }
    @Test void highConfidenceNoMatchDoesNotGuess() {
        mode("ASSIST"); answer("NONE", 0.99);
        var result = service.match(groups, context);
        assertTrue(result.applied()); assertTrue(result.items().isEmpty());
    }
    @Test void uncertainOrInventedMatchFallsBack() {
        mode("ASSIST"); answer("LABORATORY|101", 0.6);
        assertFalse(service.match(groups, context).applied());
        answer("LABORATORY|999", 0.99);
        assertFalse(service.match(groups, context).applied());
    }
    @Test void missingKeyAndProviderFailureDoNotLeakSecrets() {
        mode("ASSIST");
        when(policy.secret(1L, "decision-api-key", null)).thenReturn(null);
        assertFalse(service.match(groups, context).applied()); verifyNoInteractions(gateway);
        when(policy.secret(1L, "decision-api-key", null)).thenReturn("independent-test-key");
        when(gateway.decide(any(), any())).thenThrow(new IllegalStateException("independent-test-key"));
        assertFalse(service.match(groups, context).alerts().toString().contains("independent-test-key"));
    }
}
