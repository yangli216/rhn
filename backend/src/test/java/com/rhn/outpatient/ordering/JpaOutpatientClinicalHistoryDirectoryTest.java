package com.rhn.outpatient.ordering;

import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory.MedicationCatalogFact;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class JpaOutpatientClinicalHistoryDirectoryTest {
    @Test void projectsPersistedCatalogAndQuantitySnapshotsWithoutReconstructingThem() {
        var encounters = mock(EncounterDirectory.class);
        var medications = mock(MedicationRequestRepository.class);
        var contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "test", Set.of(),
                10L, 20L, "DEPARTMENT", Set.of(), Set.of()));
        var encounter = mock(EncounterDirectory.EncounterSnapshot.class);
        when(encounter.id()).thenReturn(80L);
        when(encounter.status()).thenReturn("COMPLETED");
        when(encounter.registeredAt()).thenReturn(Instant.parse("2026-08-01T00:00:00Z"));
        when(encounters.recentCompletedForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(encounter));
        var order = mock(MedicationRequest.class);
        when(order.status()).thenReturn(MedicationRequestStatus.ACTIVE);
        when(order.medicationId()).thenReturn(100L); when(order.catalogItemId()).thenReturn(200L); when(order.packageId()).thenReturn(300L);
        when(order.preparationSpecSnapshot()).thenReturn("5mg"); when(order.preparationUnitSnapshot()).thenReturn("片");
        when(order.quantity()).thenReturn(new BigDecimal("2")); when(order.quantityUnit()).thenReturn("BOX");
        when(order.baseQuantity()).thenReturn(new BigDecimal("60.000")); when(order.baseUnit()).thenReturn("片");
        when(order.packageFactorSnapshot()).thenReturn(new BigDecimal("30.000")); when(order.packageUnitNameSnapshot()).thenReturn("盒");
        when(order.packageSpecSnapshot()).thenReturn("30片/盒"); when(order.substitutionAllowed()).thenReturn(true);
        when(order.selfProvided()).thenReturn(false); when(order.priceType()).thenReturn("SALE");
        when(order.medicationInstruction()).thenReturn("早餐后服用");
        when(order.routeId()).thenReturn(400L); when(order.routeExecutionTypeSnapshot()).thenReturn("ADMINISTRATION");
        when(order.routeResolutionStatus()).thenReturn("RESOLVED"); when(order.frequencyId()).thenReturn(500L);
        when(order.frequencyRuleSnapshot()).thenReturn("{\"code\":\"QD\",\"frequencyCount\":1}");
        when(medications.findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(1L, 80L)).thenReturn(List.of(order));
        var directory = new JpaOutpatientClinicalHistoryDirectory(encounters, mock(EncounterDiagnosisDirectory.class),
                medications, mock(ServiceRequestRepository.class), contexts);

        var fact = directory.recentForResident(7L, 99L, Instant.EPOCH, 10).getFirst().medications().getFirst();

        assertEquals(new com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory.MedicationUsageFact(400L, "ADMINISTRATION", "RESOLVED", 500L,
                "{\"code\":\"QD\",\"frequencyCount\":1}"), fact.usage());
        assertEquals(new BigDecimal("2"), fact.quantity()); assertEquals("BOX", fact.quantityUnit());
        assertEquals(new MedicationCatalogFact(100L, 200L, 300L, "5mg", "片", new BigDecimal("60"), "片",
                new BigDecimal("30"), "盒", "30片/盒", true, false, "SALE", "早餐后服用"), fact.catalog());
    }

    @Test void retainsEveryActiveFactBeyondModelContextLimits() {
        var fixture = new HistoryFixture();
        var diagnoses = java.util.stream.LongStream.rangeClosed(1, 21).mapToObj(id ->
                new EncounterDiagnosisDirectory.DiagnosisSnapshot(id, 80L, "ENCOUNTER", "D" + id,
                        "历史诊断" + id, "SECONDARY", "CONFIRMED", "ACTIVE")).toList();
        when(fixture.diagnoses.findActiveDiagnoses(1L, 80L, "ENCOUNTER")).thenReturn(diagnoses);
        var medicationRows = new java.util.ArrayList<>(java.util.stream.LongStream.rangeClosed(1, 51)
                .mapToObj(id -> historicalOrder(id, BigDecimal.ONE)).toList());
        var cancelledMedication = historicalOrder(52L, BigDecimal.ONE);
        when(cancelledMedication.status()).thenReturn(MedicationRequestStatus.CANCELLED);
        medicationRows.add(cancelledMedication);
        when(fixture.medications.findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(1L, 80L)).thenReturn(medicationRows);
        var serviceRows = new java.util.ArrayList<>(java.util.stream.LongStream.rangeClosed(1, 51).mapToObj(id -> {
            var order = mock(ServiceRequest.class);
            when(order.id()).thenReturn(id);
            when(order.status()).thenReturn(ServiceRequestStatus.ACTIVE);
            when(order.itemCodeSnapshot()).thenReturn("S" + id);
            return order;
        }).toList());
        var cancelledService = mock(ServiceRequest.class);
        when(cancelledService.status()).thenReturn(ServiceRequestStatus.CANCELLED);
        serviceRows.add(cancelledService);
        when(fixture.services.findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(1L, 80L)).thenReturn(serviceRows);

        var result = fixture.directory.recentForResident(7L, 99L, Instant.EPOCH, 10).getFirst();

        assertAll(
                () -> assertEquals(21, result.diagnoses().size()),
                () -> assertEquals("D21", result.diagnoses().getLast().code()),
                () -> assertEquals(51, result.medications().size()),
                () -> assertEquals(51L, result.medications().getLast().id()),
                () -> assertEquals(51, result.services().size()),
                () -> assertEquals("S51", result.services().getLast().code()));
    }

    @Test void conflictingRegimenAfterFiftiethOrderStillRequiresReview() {
        var fixture = new HistoryFixture();
        var rows = new java.util.ArrayList<>(java.util.stream.LongStream.rangeClosed(1, 50)
                .mapToObj(id -> historicalOrder(id, BigDecimal.ONE)).toList());
        rows.add(historicalOrder(51L, BigDecimal.TEN));
        when(fixture.medications.findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(1L, 80L)).thenReturn(rows);
        when(fixture.medications.findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(1L, 70L)).thenReturn(rows);
        var inventory = mock(com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.class);
        var resolver = new com.rhn.ai.application.HistoricalPlanResolutionService(fixture.encounters,
                fixture.directory, inventory, fixture.contexts,
                mock(com.rhn.platform.masterdata.api.MedicationRouteDirectory.class),
                mock(com.rhn.platform.masterdata.api.OrderFrequencyDirectory.class),
                mock(com.rhn.shared.json.JsonCodec.class));

        var result = resolver.resolveHistoricalStablePlan(99L).orElseThrow();

        assertTrue(result.medications().isEmpty());
        assertEquals(2, result.reviewItems().size());
        assertTrue(result.reviewItems().stream().allMatch(item -> item.reason().contains("多套重复历史用法")));
        assertTrue(result.reviewItems().stream().anyMatch(item -> Long.valueOf(51).equals(item.sourceId())));
        verifyNoInteractions(inventory);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"diagnoses", "medications", "services"})
    void unavailableFactCollectionsCannotMasqueradeAsEmptyHistory(String missing) {
        assertThrows(NullPointerException.class, () -> new com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot(
                80L, 0, Instant.now(), "diagnoses".equals(missing) ? null : List.of(),
                "medications".equals(missing) ? null : List.of(), "services".equals(missing) ? null : List.of()));
    }

    private static MedicationRequest historicalOrder(Long id, BigDecimal dose) {
        var order = mock(MedicationRequest.class);
        when(order.id()).thenReturn(id);
        when(order.status()).thenReturn(MedicationRequestStatus.ACTIVE);
        when(order.medicationCodeSnapshot()).thenReturn("MED-1");
        when(order.medicationNameSnapshot()).thenReturn("历史用药");
        when(order.medicationId()).thenReturn(100L);
        when(order.catalogItemId()).thenReturn(200L);
        when(order.packageId()).thenReturn(null);
        when(order.preparationSpecSnapshot()).thenReturn("5mg");
        when(order.preparationUnitSnapshot()).thenReturn("片");
        when(order.baseUnit()).thenReturn("片");
        when(order.doseValue()).thenReturn(dose);
        when(order.doseUnit()).thenReturn("mg");
        when(order.routeCode()).thenReturn("ORAL");
        when(order.frequencyCode()).thenReturn("QD");
        when(order.durationValue()).thenReturn(BigDecimal.ONE);
        when(order.durationUnit()).thenReturn("D");
        when(order.quantity()).thenReturn(BigDecimal.ONE);
        when(order.quantityUnit()).thenReturn("片");
        when(order.baseQuantity()).thenReturn(BigDecimal.ONE);
        when(order.packageFactorSnapshot()).thenReturn(BigDecimal.ONE);
        when(order.priceType()).thenReturn("SALE");
        return order;
    }

    private static final class HistoryFixture {
        final EncounterDirectory encounters = mock(EncounterDirectory.class);
        final EncounterDiagnosisDirectory diagnoses = mock(EncounterDiagnosisDirectory.class);
        final MedicationRequestRepository medications = mock(MedicationRequestRepository.class);
        final ServiceRequestRepository services = mock(ServiceRequestRepository.class);
        final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
        final JpaOutpatientClinicalHistoryDirectory directory = new JpaOutpatientClinicalHistoryDirectory(
                encounters, diagnoses, medications, services, contexts);

        HistoryFixture() {
            when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "test", Set.of(),
                    10L, 20L, "DEPARTMENT", Set.of(), Set.of()));
            var current = new EncounterDirectory.EncounterSnapshot(99L, 1L, 7L, 10L, 20L, "E99", "30",
                    "IN_PROGRESS", 0, "全科", Instant.now());
            when(encounters.requireAccessible(99L)).thenReturn(current);
            var past = List.of(80L, 70L).stream().map(id -> new EncounterDirectory.EncounterSnapshot(
                    id, 1L, 7L, 10L, 20L, "E" + id, "30", "COMPLETED", 0, "全科", Instant.now())).toList();
            when(encounters.recentCompletedForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(past);
        }
    }

}
