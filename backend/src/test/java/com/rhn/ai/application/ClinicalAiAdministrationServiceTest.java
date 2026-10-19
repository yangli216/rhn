package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAiAdministrationContracts.ConfigurationTestRequest;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.Scope;
import com.rhn.platform.configuration.api.ConfigurationAdministration;
import com.rhn.platform.configuration.api.ConfigurationAdministration.ManagedValue;
import com.rhn.platform.configuration.api.ConfigurationAdministration.ValueMode;
import com.rhn.platform.configuration.api.ConfigurationValue;
import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.json.JsonMapper;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ClinicalAiAdministrationServiceTest {
    private final ConfigurationAdministration administration = mock(ConfigurationAdministration.class);
    private final ClinicalAiRuntimePolicy policy = mock(ClinicalAiRuntimePolicy.class);
    private final ClinicalAssistantSettings fallback = mock(ClinicalAssistantSettings.class);
    private final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    private final JsonCodec json = mock(JsonCodec.class);
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final DecisionModelGateway decisionGateway = mock(DecisionModelGateway.class);
    private final ClinicalAiAdministrationService service = new ClinicalAiAdministrationService(
            administration, policy, fallback, mock(SecretEncryptionService.class), contexts, json,
            decisionGateway);

    @BeforeEach
    void setup() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "admin", "probe",
                Set.of("ROLE_ADMIN"), 10L, 11L, "ORGANIZATION", Set.of(10L), Set.of(11L), 12L));
        when(fallback.requestTimeout()).thenReturn(Duration.ofSeconds(47));
        when(json.write(any())).thenAnswer(call -> mapper.writeValueAsString(call.getArgument(0)));
        when(json.readTree(anyString())).thenAnswer(call -> mapper.readTree((String) call.getArgument(0)));
    }

    @ParameterizedTest
    @CsvSource({"MODEL,5", "MODEL,60", "MODEL,61", "MODEL,90", "MODEL,120",
            "SPEECH,5", "SPEECH,90", "SPEECH,120", "KNOWLEDGE,5", "KNOWLEDGE,90", "KNOWLEDGE,120"})
    void preservesExplicitTimeoutForEveryProbe(String target, int seconds) throws Exception {
        assertProbeTimeout(target, Scope.TENANT, seconds, seconds);
        verifyNoInteractions(policy, administration);
    }

    @ParameterizedTest
    @ValueSource(strings = {"MODEL", "SPEECH", "KNOWLEDGE"})
    void usesTenantTimeoutWhenRequestOmitsIt(String target) throws Exception {
        var value = mock(ConfigurationValue.class);
        when(value.value()).thenReturn(mapper.readTree("73"));
        when(policy.resolved(1L, "request-timeout-seconds")).thenReturn(value);
        assertProbeTimeout(target, Scope.TENANT, null, 73);
        verifyNoInteractions(administration);
    }

    @ParameterizedTest
    @CsvSource({"MODEL,TENANT", "SPEECH,TENANT", "KNOWLEDGE,TENANT",
            "MODEL,PLATFORM", "SPEECH,PLATFORM", "KNOWLEDGE,PLATFORM"})
    void inheritsPlatformTimeoutWithoutReadingTenantOverridesForPlatformScope(String target, Scope scope) throws Exception {
        when(administration.findValue("ai.clinical.request-timeout-seconds", "PLATFORM"))
                .thenReturn(Optional.of(new ManagedValue("88", null, ValueMode.OVERRIDE, true, 1)));
        assertProbeTimeout(target, scope, null, 88);
        if (scope == Scope.PLATFORM) verifyNoInteractions(policy);
    }

    @ParameterizedTest
    @ValueSource(strings = {"MODEL", "SPEECH", "KNOWLEDGE"})
    void usesDeploymentTimeoutWhenNoOverrideExists(String target) throws Exception {
        assertProbeTimeout(target, Scope.TENANT, null, 47);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 17, 30})
    void preservesExplicitDecisionTimeout(int seconds) {
        assertDecisionTimeout(Scope.TENANT, seconds, seconds);
        verifyNoInteractions(policy, administration);
    }

    @Test
    void usesSavedDecisionTimeoutInsteadOfModelRequestTimeout() {
        var value = mock(ConfigurationValue.class);
        when(value.value()).thenReturn(mapper.readTree("19"));
        when(policy.resolved(1L, "decision-timeout-seconds")).thenReturn(value);
        assertDecisionTimeout(Scope.TENANT, null, 19);
        verify(policy).resolved(1L, "decision-timeout-seconds");
        verifyNoMoreInteractions(policy);
        verifyNoInteractions(administration);
    }

    @ParameterizedTest
    @ValueSource(strings = {"TENANT", "PLATFORM"})
    void inheritsPlatformDecisionTimeout(Scope scope) {
        when(administration.findValue("ai.clinical.decision-timeout-seconds", "PLATFORM"))
                .thenReturn(Optional.of(new ManagedValue("22", null, ValueMode.OVERRIDE, true, 1)));
        assertDecisionTimeout(scope, null, 22);
        if (scope == Scope.PLATFORM) verifyNoInteractions(policy);
    }

    @Test
    void usesDecisionDeploymentDefaultWhenNoOverrideExists() {
        assertDecisionTimeout(Scope.TENANT, null, 8);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 31, 120})
    void rejectsInvalidDecisionTimeoutBeforeCallingGateway(int seconds) {
        var error = assertThrows(BusinessException.class,
                () -> service.test(request("DECISION", Scope.TENANT, seconds)));
        assertEquals("AI_TEST_TIMEOUT_INVALID", error.code());
        assertTrue(error.getMessage().contains("1–30"));
        verifyNoInteractions(decisionGateway);
    }

    private void assertDecisionTimeout(Scope scope, Integer seconds, int expected) {
        when(decisionGateway.decide(any(), any())).thenReturn(new DecisionModelGateway.Result(
                "test-trace", "test-model", Map.of("catalog_probe",
                new DecisionModelGateway.ChoiceAnswer("MATCH", Map.of("MATCH", 1.0, "NONE", 0.0), 1.0)), 1));
        var result = service.test(request("DECISION", scope, seconds));
        assertTrue(result.success());
        var settings = ArgumentCaptor.forClass(DecisionModelSettings.class);
        verify(decisionGateway).decide(any(), settings.capture());
        assertEquals(Duration.ofSeconds(expected), settings.getValue().timeout());
        assertEquals("test-key", settings.getValue().apiKey());
    }

    @ParameterizedTest
    @CsvSource({"MODEL,0", "MODEL,4", "MODEL,121", "SPEECH,4", "SPEECH,121",
            "KNOWLEDGE,4", "KNOWLEDGE,121"})
    void rejectsInvalidTimeoutBeforeCreatingHttpClient(String target, int seconds) {
        try (var clients = mockStatic(HttpClient.class)) {
            var error = assertThrows(BusinessException.class,
                    () -> service.test(request(target, Scope.TENANT, seconds)));
            assertEquals("AI_TEST_TIMEOUT_INVALID", error.code());
            clients.verifyNoInteractions();
        }
    }

    @ParameterizedTest
    @CsvSource({
            "qwen3-asr-flash,https://speech.example:9443/private-asr?version=2",
            "paraformer-v2,https://speech.example/private-asr",
            "sensevoice-v1,https://speech.example/private-asr",
            "qwen3-asr-flash,https://dashscope-intl.aliyuncs.com/api/v1/services/audio/asr/transcription",
            "qwen3-asr-flash,https://dashscope.aliyuncs.com/misconfigured-path"
    })
    void speechProbePreservesConfiguredEndpointEvenWhenUpstreamFails(String model, String endpoint) throws Exception {
        var builder = mock(HttpClient.Builder.class, RETURNS_SELF);
        var client = mock(HttpClient.class);
        when(builder.build()).thenReturn(client);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new java.net.ConnectException("synthetic connection failure"));
        try (var clients = mockStatic(HttpClient.class)) {
            clients.when(HttpClient::newBuilder).thenReturn(builder);
            var result = service.test(new ConfigurationTestRequest(Scope.TENANT, "SPEECH", endpoint,
                    model, "test-key", 30));
            assertFalse(result.success());
            assertEquals(502, result.statusCode());
            var sent = ArgumentCaptor.forClass(HttpRequest.class);
            verify(client).send(sent.capture(), any(HttpResponse.BodyHandler.class));
            assertEquals(java.net.URI.create(endpoint), sent.getValue().uri());
            assertEquals("Bearer test-key", sent.getValue().headers().firstValue("Authorization").orElseThrow());
            assertEquals("enable", sent.getValue().headers().firstValue("X-DashScope-Async").orElseThrow());
            verifyNoMoreInteractions(client);
        }
    }

    @ParameterizedTest
    @CsvSource({
            "qwen3-asr-flash,https://speech.example/v1/audio/transcriptions",
            "paraformer-v2,https://speech.example/v1/audio/transcriptions",
            "sensevoice-v1,https://speech.example/v1/audio/transcriptions/",
            "qwen3-asr-flash,https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions",
            "test-transcribe,https://speech.example/v1/audio/transcriptions?provider=dashscope.aliyuncs.com"
    })
    void explicitOpenAiSpeechInterfaceOverridesModelAndProviderHints(String model, String endpoint) throws Exception {
        var builder = mock(HttpClient.Builder.class, RETURNS_SELF);
        var client = mock(HttpClient.class);
        when(builder.build()).thenReturn(client);
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new java.net.ConnectException("synthetic connection failure"));
        try (var clients = mockStatic(HttpClient.class)) {
            clients.when(HttpClient::newBuilder).thenReturn(builder);
            var result = service.test(new ConfigurationTestRequest(Scope.TENANT, "SPEECH", endpoint,
                    model, "test-key", 30));
            assertEquals(502, result.statusCode());
            var sent = ArgumentCaptor.forClass(HttpRequest.class);
            verify(client).send(sent.capture(), any(HttpResponse.BodyHandler.class));
            assertEquals(java.net.URI.create(endpoint), sent.getValue().uri());
            assertTrue(sent.getValue().headers().firstValue("Content-Type").orElseThrow().startsWith("multipart/form-data;"));
            assertTrue(sent.getValue().headers().firstValue("X-DashScope-Async").isEmpty());
        }
    }

    private void assertProbeTimeout(String target, Scope scope, Integer seconds, int expected) throws Exception {
        var builder = mock(HttpClient.Builder.class, RETURNS_SELF);
        var client = mock(HttpClient.class);
        when(builder.build()).thenReturn(client);
        // Inspect the actual outgoing request without sending traffic or waiting for a timeout.
        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new java.net.http.HttpTimeoutException("synthetic timeout"));
        try (var clients = mockStatic(HttpClient.class)) {
            clients.when(HttpClient::newBuilder).thenReturn(builder);
            var result = service.test(request(target, scope, seconds));
            assertEquals(504, result.statusCode());
            assertTrue(result.message().contains(expected + " 秒"));
            var sent = ArgumentCaptor.forClass(HttpRequest.class);
            verify(client).send(sent.capture(), any(HttpResponse.BodyHandler.class));
            assertEquals(Duration.ofSeconds(expected), sent.getValue().timeout().orElseThrow());
        }
    }

    private ConfigurationTestRequest request(String target, Scope scope, Integer seconds) {
        return new ConfigurationTestRequest(scope, target, "https://probe.example/test",
                "test-model", "test-key", seconds);
    }
}
