package com.rhn.billing.application;

import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class InsuranceTypeCodesTest {
    @Test void mapsDictionaryCoverageTypesToInsuranceTypes() {
        assertEquals("310", InsuranceTypeCodes.of("01"));
        assertEquals("310", InsuranceTypeCodes.of("0102"));
        assertEquals("390", InsuranceTypeCodes.of("02"));
        assertEquals("390", InsuranceTypeCodes.of(" 0201 "));
    }

    @Test void keepsThreeDigitInsuranceTypesAsIs() {
        assertEquals("310", InsuranceTypeCodes.of("310"));
        assertEquals("320", InsuranceTypeCodes.of("320"));
    }

    @Test void rejectsCoverageTypesWithoutAnInsuranceType() {
        for (String code : new String[]{"07", "05", "99", "", null}) {
            assertEquals("INSURANCE_TYPE_UNMAPPED", assertThrows(BusinessException.class, () -> InsuranceTypeCodes.of(code)).code());
        }
    }
}
