package com.rhn.inpatient.application;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class InpatientWardBoardServiceTest {
    @Test
    void compares_bed_numbers_by_numeric_runs_instead_of_lexicographically() {
        assertTrue(InpatientWardBoardService.compareNatural("2床", "10床") < 0);
        assertTrue(InpatientWardBoardService.compareNatural("A2-3", "A2-11") < 0);
        assertTrue(InpatientWardBoardService.compareNatural("02床", null) < 0);
    }
}
