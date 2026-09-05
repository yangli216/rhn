package com.rhn;

import com.rhn.healthcore.api.ClinicalValidationDirectory;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ClinicalValidationFoundationTest extends RhnIntegrationTestSupport {
    @Autowired ClinicalValidationDirectory validation;

    @Test
    void resolvesWarningProfileFromParameterCenter() throws Exception {
        mockMvc.perform(get("/api/clinical-safety/vital-sign-rules").with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rules[?(@.code == 'temperature')].hardMinimum").value(20))
                .andExpect(jsonPath("$.rules[?(@.code == 'temperature')].hardMaximum").value(45))
                .andExpect(jsonPath("$.rules[?(@.code == 'temperature')].warningMinimum").value(35))
                .andExpect(jsonPath("$.rules[?(@.code == 'temperature')].warningMaximum").value(42));
    }

    @Test
    void rejectsImpossibleValuesAndBloodPressureRelationship() {
        assertCode("CLINICAL_VITAL_VALUE_INVALID", new ClinicalValidationDirectory.VitalSignsInput(
                new BigDecimal("50"), null, null, null, null, null, null, null, null, null));
        assertCode("CLINICAL_BLOOD_PRESSURE_RELATION_INVALID", new ClinicalValidationDirectory.VitalSignsInput(
                null, null, null, new BigDecimal("80"), new BigDecimal("120"),
                null, null, null, null, null));
    }

    private void assertCode(String code, ClinicalValidationDirectory.VitalSignsInput input) {
        assertThatThrownBy(() -> validation.validateVitalSigns(input))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.code()).isEqualTo(code));
    }
}
