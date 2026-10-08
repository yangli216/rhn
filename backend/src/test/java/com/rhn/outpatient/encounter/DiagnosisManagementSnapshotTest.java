package com.rhn.outpatient.encounter;

import com.rhn.platform.terminology.api.DiseaseReferenceSnapshot.DiseaseManagementSnapshot;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class DiagnosisManagementSnapshotTest {
    @Test void authoritativeMissingOrIncompleteProgramsMustNotBeSavedAsConfirmedEmpty() {
        assertThrows(BusinessException.class, () -> DiagnosisManagementSnapshot.confirmed(null));
        assertThrows(BusinessException.class, () -> DiagnosisManagementSnapshot.confirmed(
                java.util.Collections.singletonList(null)));
        assertThrows(BusinessException.class, () -> DiagnosisManagementSnapshot.confirmed(
                List.of(new DiseaseManagementSnapshot(null, "CODE", "名称", "CHRONIC_CARE", "PROMPT_CONFIRMATION", null, null))));
        assertThrows(BusinessException.class, () -> DiagnosisManagementSnapshot.confirmed(
                List.of(new DiseaseManagementSnapshot(1L, "CODE", "名称", "CHRONIC_CARE", "PROMPT_CONFIRMATION", null, -1))));
        assertEquals(List.of(), DiagnosisManagementSnapshot.confirmed(List.of()).programs());
        assertNull(DiagnosisManagementSnapshot.unconfirmed().programs());
    }
}
