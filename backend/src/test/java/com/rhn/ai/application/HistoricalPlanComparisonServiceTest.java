package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.HistoricalStablePlanView;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.DiagnosisInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.MedicationInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.platform.masterdata.api.MedicationSemanticDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HistoricalPlanComparisonServiceTest {
    @Test
    void computes_deterministic_diagnosis_and_medication_differences() {
        HistoricalPlanResolutionService historicalPlans = mock(HistoricalPlanResolutionService.class);
        OutpatientPlanTemplateDirectory plans = mock(OutpatientPlanTemplateDirectory.class);
        MedicationSemanticDirectory semantics = mock(MedicationSemanticDirectory.class);
        ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "corr", Set.of(),
                10L, 20L, "ASSIGNED", Set.of(10L), Set.of(20L), 30L));
        var historicalMedication = new MedicationInput(100L, 200L, 300L, "氨氯地平片", "5mg",
                new BigDecimal("5"), "mg", "ORAL", "QD", new BigDecimal("30"), "天",
                BigDecimal.ONE, "盒", false, false, null, "SALE", true, null);
        var historical = new HistoricalStablePlanView(9L, 8L, Instant.EPOCH, "高血压历史方案", "摘要",
                List.of(new DiagnosisInput("WHO.BD.CS.ICD10", "WESTERN_MEDICINE", "I10", "原发性高血压", "PRIMARY")),
                List.of(historicalMedication), List.of(), List.of());
        when(historicalPlans.resolveHistoricalStablePlan(9L)).thenReturn(Optional.of(historical));
        var standardMedication = new OutpatientPlanTemplateDirectory.MedicationSnapshot(1L, 100L, 201L, 301L,
                "WESTERN", "MED-1", "氨氯地平片", "5mg", "氨氯地平片 5mg",
                new BigDecimal("10"), "mg", "ORAL", "QD", new BigDecimal("30"), "天",
                BigDecimal.ONE, "盒", null, true, false, "SALE", true, null);
        var standard = new OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(7L, 0, "HOSPITAL", "MANUAL",
                null, "高血压标准方案", null, 1,
                List.of(new OutpatientPlanTemplateDirectory.DiagnosisSnapshot("WHO.BD.CS.ICD10",
                        "WESTERN_MEDICINE", "I10", "原发性高血压", "PRIMARY")),
                List.of(standardMedication), List.of(), List.of());
        when(plans.visibleForCurrentContext()).thenReturn(List.of(standard));

        var result = new HistoricalPlanComparisonService(historicalPlans, plans, semantics, contexts)
                .compare(9L, 7L);

        assertEquals(List.of("DIAGNOSIS", "MEDICATION"),
                result.differences().stream().map(value -> value.category()).toList());
        assertEquals("CONSISTENT", result.differences().getFirst().status());
        assertEquals("CONFLICT", result.differences().get(1).status());
        assertTrue(result.differences().get(1).reason().contains("剂量"));
    }
}
