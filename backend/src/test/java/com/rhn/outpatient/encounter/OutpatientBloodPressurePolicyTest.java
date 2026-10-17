package com.rhn.outpatient.encounter;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OutpatientBloodPressurePolicyTest {
    private static final LocalDate VISIT = LocalDate.of(2026, 10, 16);
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void defaultRequiresAdultsAndUnknownAgeAndBlocksOnlyAtCompletion() {
        var settings = OutpatientBloodPressurePolicy.parse(null);
        assertEquals(OutpatientBloodPressurePolicy.DEFAULT_SETTINGS, settings);
        var adult = OutpatientBloodPressurePolicy.requirement(settings, LocalDate.of(2008, 10, 16), VISIT);
        assertTrue(adult.required());
        assertFalse(adult.blocksDraft());
        assertTrue(adult.blocksCompletion());
        assertFalse(OutpatientBloodPressurePolicy.requirement(settings, LocalDate.of(2008, 10, 17), VISIT).required());
        assertTrue(OutpatientBloodPressurePolicy.requirement(settings, null, VISIT).required());
        assertTrue(OutpatientBloodPressurePolicy.requirement(settings, VISIT.plusDays(1), VISIT).required());
    }

    @Test
    void organizationSettingsChangeAgeThresholdUnknownAgeAndEnforcementStage() {
        var settings = OutpatientBloodPressurePolicy.parse(json.readTree("""
                {"enabled":true,"minAge":35,"unknownAgeRequired":false,"enforceAt":"DRAFT"}
                """));
        var thirtyFive = OutpatientBloodPressurePolicy.requirement(settings, LocalDate.of(1991, 10, 16), VISIT);
        assertTrue(thirtyFive.blocksDraft());
        assertTrue(thirtyFive.message().contains("35 周岁"));
        assertFalse(OutpatientBloodPressurePolicy.requirement(settings, LocalDate.of(1991, 10, 17), VISIT).required());
        assertFalse(OutpatientBloodPressurePolicy.requirement(settings, null, VISIT).required());
        var disabled = OutpatientBloodPressurePolicy.parse(json.readTree("{\"enabled\":false,\"minAge\":0}"));
        assertFalse(OutpatientBloodPressurePolicy.requirement(disabled, null, VISIT).required());
    }

    @Test
    void invalidFieldsFallBackToDefaultsFieldByField() {
        var settings = OutpatientBloodPressurePolicy.parse(json.readTree("{\"minAge\":-1,\"enforceAt\":\"LATER\"}"));
        assertEquals(OutpatientBloodPressurePolicy.DEFAULT_SETTINGS, settings);
    }
}
