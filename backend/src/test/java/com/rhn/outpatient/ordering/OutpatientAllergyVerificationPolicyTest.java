package com.rhn.outpatient.ordering;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationValue;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OutpatientAllergyVerificationPolicyTest {
    private static final ExecutionContext CONTEXT = new ExecutionContext(
            1L, 2L, "doctor", "corr-1", Set.of());

    @Test
    void defaultsToWarningAndHonorsDeploymentOverride() {
        ConfigurationDirectory directory = mock(ConfigurationDirectory.class);

        assertEquals(OutpatientAllergyVerificationPolicy.Mode.WARN,
                new OutpatientAllergyVerificationPolicy(directory, "").resolve(CONTEXT, 10L, 20L));
        assertEquals(OutpatientAllergyVerificationPolicy.Mode.BLOCK,
                new OutpatientAllergyVerificationPolicy(directory, "block").resolve(CONTEXT, 10L, 20L));
    }

    @Test
    void resolvesInstitutionParameterAndFallsBackToWarningForInvalidValues() {
        ConfigurationDirectory directory = mock(ConfigurationDirectory.class);
        ConfigurationValue configured = mock(ConfigurationValue.class);
        JsonNode value = mock(JsonNode.class);
        when(configured.value()).thenReturn(value);
        when(directory.resolveCurrent(eq(1L), eq(2L), eq(10L), eq(20L),
                eq(OutpatientAllergyVerificationPolicy.PARAMETER_KEY))).thenReturn(configured);

        OutpatientAllergyVerificationPolicy policy = new OutpatientAllergyVerificationPolicy(directory, "");
        when(value.asString()).thenReturn("BLOCK");
        assertEquals(OutpatientAllergyVerificationPolicy.Mode.BLOCK, policy.resolve(CONTEXT, 10L, 20L));

        when(value.asString()).thenReturn("unexpected");
        assertEquals(OutpatientAllergyVerificationPolicy.Mode.WARN, policy.resolve(CONTEXT, 10L, 20L));
    }
}
