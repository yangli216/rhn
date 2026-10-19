package com.rhn.platform.security;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationValue;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecondFactorPolicyTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void privileged_mode_covers_only_configured_administrative_authorities() {
        SecondFactorPolicy policy = policy("{\"mode\":\"REQUIRED_FOR_PRIVILEGED\"}", "");
        assertTrue(policy.required(1L, List.of("OUTPATIENT.ACCESS", "IAM.MANAGE")));
        assertFalse(policy.required(1L, List.of("OUTPATIENT.ACCESS")));
    }

    @Test
    void missing_or_unknown_values_do_not_require_a_second_factor() {
        assertEquals(SecondFactorPolicy.Mode.NONE, policy(null, "").mode(1L));
        assertEquals(SecondFactorPolicy.Mode.NONE, policy("{\"mode\":\"SOMETIMES\"}", "").mode(1L));
        assertTrue(policy("{\"mode\":\"required\"}", "").required(1L, List.of()));
    }

    @Test
    void break_glass_accounts_are_matched_case_insensitively() {
        SecondFactorPolicy policy = policy("{\"mode\":\"REQUIRED\"}", " Emergency-Admin , ops ");
        assertTrue(policy.exempt("emergency-admin"));
        assertTrue(policy.exempt("OPS"));
        assertFalse(policy.exempt("doctor"));
        assertFalse(policy.exempt(null));
    }

    private static SecondFactorPolicy policy(String value, String exempt) {
        ConfigurationDirectory directory = (tenantId, userId, organizationId, departmentId, product, module,
                                            environment, key) -> new ConfigurationValue(key,
                value == null ? null : JSON.readTree(value), "JSON", "SYSTEM", true, true, "TENANT", tenantId,
                null, "DEFAULT", null, null, "OVERRIDE", false, 0L, null);
        return new SecondFactorPolicy(directory, "IAM.MANAGE,MAINTENANCE.MANAGE", exempt);
    }
}
