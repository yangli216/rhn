package com.rhn.ai.application;

import com.rhn.platform.terminology.api.DiseaseReferenceSnapshot;
import com.rhn.platform.terminology.api.TerminologyConceptSnapshot;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DiagnosisNormalizationServiceTest {
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 28);

    @Test
    void exact_name_with_one_parent_category_resolves_to_that_category() {
        TerminologyDirectory terminology = mock(TerminologyDirectory.class);
        var category = concept(1L, "I10", "原发性高血压");
        var detail = concept(2L, "I10.x09", "原发性高血压");
        when(terminology.findDiseasesByExactName(1L, DiagnosisNormalizationService.ICD10_SYSTEM,
                "原发性高血压", TODAY)).thenReturn(List.of(detail, category));
        when(terminology.requireDisease(1L, 1L, TODAY)).thenReturn(disease(category));

        var result = new DiagnosisNormalizationService(terminology)
                .normalize(1L, null, null, "原发性高血压", TODAY);

        assertTrue(result.matched());
        assertEquals("I10", result.concept().code());
        assertEquals("EXACT_CATEGORY_NAME", result.evidence());
    }

    @Test
    void unrelated_same_name_candidates_remain_ambiguous_and_domain_mismatch_never_falls_back() {
        TerminologyDirectory terminology = mock(TerminologyDirectory.class);
        when(terminology.findDiseasesByExactName(1L, DiagnosisNormalizationService.ICD10_SYSTEM,
                "同名诊断", TODAY)).thenReturn(List.of(concept(1L, "A01", "同名诊断"),
                concept(2L, "B02", "同名诊断")));
        DiagnosisNormalizationService service = new DiagnosisNormalizationService(terminology);

        assertEquals(DiagnosisNormalizationService.Status.AMBIGUOUS,
                service.normalize(1L, null, null, "同名诊断", TODAY).status());
        assertEquals(DiagnosisNormalizationService.Status.DOMAIN_MISMATCH,
                service.normalize(1L, DiagnosisNormalizationService.ICD10_SYSTEM,
                        "TCM_DISEASE", "I10", TODAY).status());
    }

    private TerminologyConceptSnapshot concept(Long id, String code, String display) {
        return new TerminologyConceptSnapshot(id, DiagnosisNormalizationService.ICD10_SYSTEM,
                "http://hl7.org/fhir/sid/icd-10", "2019", code, display);
    }

    private DiseaseReferenceSnapshot disease(TerminologyConceptSnapshot concept) {
        return new DiseaseReferenceSnapshot(concept.id(), concept.systemCode(), concept.systemUri(),
                concept.systemVersion(), "WESTERN_MEDICINE", concept.code(), concept.display(), List.of());
    }
}
