package com.rhn.ai.application;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView;
import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HistoricalPlanResolutionServiceTest {
    private final EncounterDirectory encounters = mock(EncounterDirectory.class);
    private final OutpatientClinicalHistoryDirectory history = mock(OutpatientClinicalHistoryDirectory.class);
    private final OutpatientPrescriptionInventoryDirectory inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
    private final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    private HistoricalPlanResolutionService service;

    @BeforeEach
    void setUp() {
        service = new HistoricalPlanResolutionService(encounters, history, inventory, contexts);
        when(encounters.requireAccessible(99L)).thenReturn(new EncounterDirectory.EncounterSnapshot(
                99L, 1L, 7L, 10L, 20L, "E99", "30", "IN_PROGRESS", 0,
                "全科", Instant.parse("2026-09-28T01:00:00Z")));
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "corr", Set.of(),
                10L, 20L, "ASSIGNED", Set.of(10L), Set.of(20L), 30L));
    }

    @Test
    void doesNotInventDiagnosisOrMedicationFieldsWhenHistoryIsIncomplete() {
        var incomplete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", null, null);
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, incomplete), encounter(70L, incomplete)));

        assertTrue(service.resolveHistoricalStablePlan(99L).isEmpty());
        verify(inventory, never()).findOrderableMedications(any(), any(), any(), any());
    }

    @Test
    void requiresTheSameCompleteRegimenInAtLeastTwoCompletedEncounters() {
        var complete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, complete)));

        assertTrue(service.resolveHistoricalStablePlan(99L).isEmpty());
    }

    @Test
    void ignoresCancelledHistoricalOrders() {
        var cancelled = medication(1L, "CANCELLED", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, cancelled), encounter(70L, cancelled)));

        assertTrue(service.resolveHistoricalStablePlan(99L).isEmpty());
        verify(inventory, never()).findOrderableMedications(any(), any(), any(), any());
    }

    @Test
    void keepsAmbiguousProductsOutOfTheReusableDraft() {
        var complete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, complete), encounter(70L, complete)));
        var candidate = candidate(100L, "MED-1", "氨氯地平片", product(200L), product(201L));
        when(inventory.findOrderableMedications(1L, 10L, 20L, "氨氯地平片")).thenReturn(List.of(candidate));
        when(inventory.inspectMedicationAvailability(eq(1L), eq(10L), eq(20L), any(), isNull()))
                .thenAnswer(invocation -> availability(invocation.getArgument(3, Long.class) + 1000));

        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();

        assertTrue(result.diagnoses().isEmpty(), "无历史诊断时不得默认生成高血压");
        assertTrue(result.medications().isEmpty(), "多个可用品规不得静默选择首项");
        assertTrue(result.guidanceNotes().stream().anyMatch(value -> value.contains("多个可用品规")));
    }

    @Test
    void doesNotUseAPlaceholderPackageWhenCurrentInventoryCannotResolveOne() {
        var complete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, complete), encounter(70L, complete)));
        var exactCandidate = candidate(100L, "MED-1", "氨氯地平片", product(200L));
        when(inventory.findOrderableMedications(1L, 10L, 20L, "氨氯地平片")).thenReturn(List.of(exactCandidate));
        when(inventory.inspectMedicationAvailability(1L, 10L, 20L, 200L, null)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(
                        true, 1L, "门诊药房", true, 2L, null, null,
                        null, BigDecimal.valueOf(300), BigDecimal.ZERO));

        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();

        assertTrue(result.medications().isEmpty());
        assertTrue(result.guidanceNotes().stream().anyMatch(value -> value.contains("未带入草稿")));
    }

    @Test
    void reusesOnlyOneExactFullyVerifiedMedicationWithoutDefaults() {
        var complete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, complete), encounter(70L, complete)));
        var exactCandidate = candidate(100L, "MED-1", "氨氯地平片", product(200L));
        when(inventory.findOrderableMedications(1L, 10L, 20L, "氨氯地平片"))
                .thenReturn(List.of(exactCandidate));
        when(inventory.inspectMedicationAvailability(1L, 10L, 20L, 200L, null))
                .thenReturn(availability(300L));

        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();

        assertEquals(1, result.medications().size());
        var medication = result.medications().getFirst();
        assertEquals(100L, medication.medicationId());
        assertEquals(200L, medication.catalogItemId());
        assertEquals(300L, medication.packageId());
        assertEquals(new BigDecimal("5"), medication.doseValue());
        assertEquals("ORAL", medication.routeCode());
        assertEquals("QD", medication.frequencyCode());
        assertEquals(new BigDecimal("30"), medication.durationValue());
        assertEquals(false, medication.substitutionAllowed());
    }

    private OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot encounter(
            Long encounterId, OutpatientClinicalHistoryDirectory.MedicationFact medication) {
        return new OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot(encounterId, 0,
                Instant.parse("2026-08-01T01:00:00Z"), List.of(), List.of(medication), List.of());
    }

    private OutpatientClinicalHistoryDirectory.MedicationFact medication(
            Long id, String status, String code, String name, BigDecimal dose, String doseUnit) {
        return new OutpatientClinicalHistoryDirectory.MedicationFact(id, 0, status, code, name,
                dose, doseUnit, "ORAL", "QD", BigDecimal.valueOf(30), "d",
                BigDecimal.ONE, "盒", Instant.parse("2026-08-01T01:00:00Z"));
    }

    private OutpatientPrescriptionInventoryDirectory.OrderableMedicationView candidate(
            Long id, String code, String name, MedicationProductView... products) {
        var value = mock(OutpatientPrescriptionInventoryDirectory.OrderableMedicationView.class);
        when(value.id()).thenReturn(id);
        when(value.code()).thenReturn(code);
        when(value.name()).thenReturn(name);
        when(value.preparationSpec()).thenReturn("5mg*30片");
        when(value.sdStatus()).thenReturn("ACTIVE");
        when(value.products()).thenReturn(List.of(products));
        return value;
    }

    private MedicationProductView product(Long id) {
        var adoption = mock(OrganizationAdoptionView.class);
        when(adoption.orderable()).thenReturn(true);
        when(adoption.dispensable()).thenReturn(true);
        var value = mock(MedicationProductView.class);
        when(value.id()).thenReturn(id);
        when(value.sdStatus()).thenReturn("ACTIVE");
        when(value.orderable()).thenReturn(true);
        when(value.organizationAdoption()).thenReturn(adoption);
        return value;
    }

    private OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView availability(Long packageId) {
        return new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(
                true, 1L, "门诊药房", true, 2L, packageId, "盒",
                BigDecimal.valueOf(30), BigDecimal.valueOf(300), BigDecimal.TEN);
    }
}
