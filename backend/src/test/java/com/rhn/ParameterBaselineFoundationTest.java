package com.rhn;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationValue;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ParameterBaselineFoundationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired ConfigurationDirectory configurationDirectory;

    @Test
    void initializes_governed_categories_and_resolves_system_defaults() {
        Integer categoryCount = jdbcTemplate.queryForObject("""
                select count(*) from parameter_categories
                where code in ('PLATFORM','PLATFORM_IDENTITY','PORTAL','PORTAL_NAVIGATION',
                               'PORTAL_NOTIFICATION','PORTAL_SECURITY')
                """, Integer.class);
        assertEquals(6, categoryCount);

        Integer definitionCount = jdbcTemplate.queryForObject("""
                select count(*) from parameter_definitions
                where id between 362387869795001 and 362387869795012
                  and parameter_category = 'SYSTEM' and status = 'ACTIVE'
                """, Integer.class);
        assertEquals(12, definitionCount);

        Integer changeCount = jdbcTemplate.queryForObject("""
                select count(*) from parameter_changes
                where request_code like 'baseline-v14:%'
                  and target_type = 'DEFINITION' and change_type = 'CREATE'
                """, Integer.class);
        assertEquals(12, changeCount);

        ConfigurationValue passwordPolicy = configurationDirectory.resolveCurrent(
                Long.valueOf(TENANT), null, null, null,
                "platform.identity.password-policy.enabled");
        assertTrue(passwordPolicy.value().asBoolean());
        assertEquals("DEFAULT", passwordPolicy.resolvedScope());
        assertFalse(passwordPolicy.cacheEnabled());

        ConfigurationValue navigationLimit = configurationDirectory.resolveCurrent(
                Long.valueOf(TENANT), null, null, null,
                "portal.navigation.hot-item.limit");
        assertEquals(9, navigationLimit.value().asInt());
        assertEquals("DEFAULT", navigationLimit.resolvedScope());
        assertTrue(navigationLimit.cacheEnabled());

        ConfigurationValue prescriptionReviewMode = configurationDirectory.resolveCurrent(
                Long.valueOf(TENANT), null, null, null,
                "pharmacy.prescription-review.mode");
        assertEquals("DISABLED", prescriptionReviewMode.value().asText());
        assertEquals("DEFAULT", prescriptionReviewMode.resolvedScope());
    }
}
