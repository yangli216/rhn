package com.rhn.ai.application;

import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class DecisionModelSettingsTest {
    private final ClinicalAiRuntimePolicy policy = mock(ClinicalAiRuntimePolicy.class);

    @BeforeEach void setup() {
        when(policy.text(eq(1L), anyString(), anyString())).thenAnswer(c -> c.getArgument(2));
        when(policy.number(eq(1L), anyString(), anyLong())).thenAnswer(c -> c.getArgument(2));
        when(policy.text(1L, "decision-mode", "DISABLED")).thenReturn("SHADOW");
    }

    @Test void defaultsToExistingJevAndSwitchesWithoutSharingCredentials() {
        when(policy.secret(1L, "decision-api-key", null)).thenReturn("jev-secret");
        when(policy.secret(1L, "decision-lingdt-api-key", null)).thenReturn("lingdt-secret");
        var jev = DecisionModelSettings.current(policy, 1L);
        assertEquals(DecisionProvider.JEV, jev.provider());
        assertEquals("jev-secret", jev.apiKey());
        when(policy.text(1L, "decision-provider", "JEV")).thenReturn("LINGDT");
        var lingdt = DecisionModelSettings.current(policy, 1L);
        assertEquals(DecisionProvider.LINGDT, lingdt.provider());
        assertEquals("https://maas-api.antdigital.com/v1/systemone", lingdt.endpoint().toString());
        assertEquals("lingdt-decision-1.0", lingdt.model());
        assertEquals("lingdt-secret", lingdt.apiKey());
        when(policy.text(1L, "decision-provider", "JEV")).thenReturn("JEV");
        assertEquals(jev, DecisionModelSettings.current(policy, 1L));
    }

    @Test void missingLingdtKeyDoesNotFallBackToJevOrClinicalCredentials() {
        when(policy.text(1L, "decision-provider", "JEV")).thenReturn("LINGDT");
        assertFalse(DecisionModelSettings.current(policy, 1L).ready());
        verify(policy).secret(1L, "decision-lingdt-api-key", null);
        verify(policy, never()).secret(1L, "decision-api-key", null);
        verify(policy, never()).secret(1L, "api-key", null);
    }

    @Test void disabledModeDoesNotReadAnyCredentialsAndUnknownProviderIsRejected() {
        when(policy.text(1L, "decision-mode", "DISABLED")).thenReturn("DISABLED");
        assertFalse(DecisionModelSettings.current(policy, 1L).ready());
        verify(policy, never()).secret(anyLong(), anyString(), any());
        when(policy.text(1L, "decision-mode", "DISABLED")).thenReturn("ASSIST");
        when(policy.text(1L, "decision-provider", "JEV")).thenReturn("UNKNOWN");
        assertEquals("DECISION_PROVIDER_INVALID", assertThrows(BusinessException.class,
                () -> DecisionModelSettings.current(policy, 1L)).code());
    }
}
