package com.rhn.billing.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationValue;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RefundPolicyTest {

    @Test
    void whenOverrideValueConfigured_shouldUseOverride() {
        ConfigurationDirectory directory = mock(ConfigurationDirectory.class);
        RefundPolicy truePolicy = new RefundPolicy(directory, "true");
        ExecutionContext context = new ExecutionContext(1L, 2L, "operator", "corr-1", Set.of());

        assertTrue(truePolicy.isUnexecutedDirectRefundAllowed(context, 10L, 20L));

        RefundPolicy falsePolicy = new RefundPolicy(directory, "false");
        assertFalse(falsePolicy.isUnexecutedDirectRefundAllowed(context, 10L, 20L));
    }

    @Test
    void whenNoOverride_shouldResolveFromDirectory() {
        ConfigurationDirectory directory = mock(ConfigurationDirectory.class);
        ExecutionContext context = new ExecutionContext(1L, 2L, "operator", "corr-1", Set.of());

        // 默认返回 null，回退到 true
        when(directory.resolveCurrent(eq(1L), eq(2L), eq(10L), eq(20L), eq(RefundPolicy.PARAMETER_KEY)))
                .thenReturn(null);

        RefundPolicy policy = new RefundPolicy(directory, "");
        assertTrue(policy.isUnexecutedDirectRefundAllowed(context, 10L, 20L));

        // 配置为 false
        ConfigurationValue falseConfig = mock(ConfigurationValue.class);
        JsonNode falseNode = mock(JsonNode.class);
        when(falseNode.asBoolean(true)).thenReturn(false);
        when(falseConfig.value()).thenReturn(falseNode);

        when(directory.resolveCurrent(eq(1L), eq(2L), eq(10L), eq(20L), eq(RefundPolicy.PARAMETER_KEY)))
                .thenReturn(falseConfig);
        assertFalse(policy.isUnexecutedDirectRefundAllowed(context, 10L, 20L));
    }
}
