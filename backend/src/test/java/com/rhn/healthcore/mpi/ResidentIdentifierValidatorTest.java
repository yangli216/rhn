package com.rhn.healthcore.mpi;

import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class ResidentIdentifierValidatorTest {
    @Test
    void acceptsValidNationalIdAndMatchingDemographics() {
        assertDoesNotThrow(() -> ResidentIdentifierValidator.validateNationalId(
                "330102195403151215", LocalDate.of(1954, 3, 15), "MALE"));
    }

    @Test
    void rejectsChecksumBirthDateAndGenderMismatch() {
        assertCode("RESIDENT_NATIONAL_ID_CHECKSUM_INVALID", () -> ResidentIdentifierValidator.validateNationalId(
                "330102195403151218", LocalDate.of(1954, 3, 15), "MALE"));
        assertCode("RESIDENT_NATIONAL_ID_BIRTH_DATE_MISMATCH", () -> ResidentIdentifierValidator.validateNationalId(
                "330102195403151215", LocalDate.of(1954, 3, 16), "MALE"));
        assertCode("RESIDENT_NATIONAL_ID_GENDER_MISMATCH", () -> ResidentIdentifierValidator.validateNationalId(
                "330102195403151215", LocalDate.of(1954, 3, 15), "FEMALE"));
    }

    private void assertCode(String code, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                exception -> org.assertj.core.api.Assertions.assertThat(exception.code()).isEqualTo(code));
    }
}
