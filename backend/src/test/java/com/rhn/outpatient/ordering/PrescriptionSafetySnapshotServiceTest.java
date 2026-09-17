package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.MedicationSafetyPort;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PrescriptionSafetySnapshotServiceTest {
    private final EncounterDirectory encounters = mock(EncounterDirectory.class);
    private final PrescriptionRepository prescriptions = mock(PrescriptionRepository.class);
    private final MedicationRequestRepository medications = mock(MedicationRequestRepository.class);
    private final com.rhn.healthcore.api.AllergyDirectory allergies = mock(com.rhn.healthcore.api.AllergyDirectory.class);
    private final com.rhn.healthcore.api.ResidentDirectory residents = mock(com.rhn.healthcore.api.ResidentDirectory.class);
    private final PrescriptionSafetySnapshotService snapshots = new PrescriptionSafetySnapshotService(encounters, prescriptions, medications,
            allergies, residents, jsonCodec());

    private static com.rhn.shared.json.JsonCodec jsonCodec() {
        var json = mock(com.rhn.shared.json.JsonCodec.class);
        var mapper = new tools.jackson.databind.ObjectMapper();
        when(json.readTree(anyString())).thenAnswer(call -> mapper.readTree((String) call.getArgument(0)));
        return json;
    }

    @Test
    void assembles_whole_prescription_from_saved_values_without_reading_latest_master_data() {
        when(encounters.requireAccessible(3L)).thenReturn(new EncounterDirectory.EncounterSnapshot(
                3L, 1L, 4L, 5L, 6L, "ENC", "7", "IN_PROGRESS", 1, "科室", null));
        var prescription = new Prescription(1L, 4L, 3L, "RX", "WESTERN", 5L, 6L, 7L, null);
        when(prescriptions.findByIdAndTenantId(prescription.id(), 1L)).thenReturn(Optional.of(prescription));
        when(allergies.activeForResident(4L)).thenReturn(List.of(
                new com.rhn.healthcore.api.AllergyDirectory.AllergySnapshot(
                        70L, 71L, "ALLERGY", "DRUG", "HIGH", null, "local", "PENICILLIN", "青霉素", null)));
        when(residents.requireSnapshot(1L, 4L)).thenReturn(
                new com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot(
                        4L, "R", "患者", "MALE", java.time.LocalDate.now().minusYears(30), null, false));
        var active = request(12L, "ACTIVE");
        when(active.skinTestExempt()).thenReturn(true);
        when(active.skinTestExemptReason()).thenReturn("既有阴性记录");
        when(active.exemptEvidenceEventId()).thenReturn(88L);
        var cancelled = request(11L, "CANCELLED");
        when(active.medicationSnapshot()).thenReturn("{\"clinicalSemantics\":{\"schemaVersion\":\"qmed-medication-semantics-v1\","
                + "\"status\":\"VERSIONED_PARTIAL\",\"medicationSemanticVersion\":\"" + "a".repeat(64) + "\"}}");
        when(medications.findByTenantIdAndRequestGroupIdOrderByAuthoredAt(1L, prescription.id()))
                .thenReturn(List.of(active, cancelled));
        var snapshot = snapshots.requireSnapshot(3L, prescription.id());
        assertEquals(List.of(11L, 12L), snapshot.medications().stream()
                .map(PrescriptionSafetySnapshot.MedicationItem::medicationRequestId).toList());
        assertEquals("CANCELLED", snapshot.medications().getFirst().status());
        var item = snapshot.medications().getLast();
        assertEquals("LEGACY", snapshot.medications().getFirst().semanticStatus());
        assertEquals("VERSIONED_PARTIAL", item.semanticStatus());
        assertEquals("{\"revision\":7}", item.frequencyRuleSnapshot());
        assertEquals(active.medicationSnapshot(), item.medicationSnapshot());
        assertEquals("RESOLVED", item.routeResolutionStatus());
        assertEquals("qmed-prescription-v2", snapshot.schemaVersion());
        assertTrue(item.skinTestExempt());
        assertEquals("既有阴性记录", item.skinTestExemptReason());
        assertEquals(88L, item.exemptEvidenceEventId());
        assertEquals(30, snapshot.patientContext().patientAgeYears());
        assertEquals("MALE", snapshot.patientContext().gender());
        assertTrue(snapshot.patientContext().allergyStatusRecorded());
        assertEquals("PENICILLIN", snapshot.patientContext().activeAllergies().getFirst().substanceCode());
        assertEquals(1L, snapshot.tenantId());
        assertEquals(0, snapshot.prescriptionRevision());

        var port = mock(MedicationSafetyPort.class);
        new PrescriptionSafetyEvaluationService(snapshots, port).evaluateShadow(3L, prescription.id());
        verify(port).evaluate(new com.rhn.outpatient.api.PrescriptionSafetyRequest(snapshot));
    }

    @Test
    void refuses_a_prescription_from_another_encounter_before_reading_items() {
        when(encounters.requireAccessible(3L)).thenReturn(new EncounterDirectory.EncounterSnapshot(
                3L, 1L, 4L, 5L, 6L, "ENC", "7", "IN_PROGRESS", 1, "科室", null));
        var foreign = new Prescription(1L, 4L, 99L, "RX", "WESTERN", 5L, 6L, 7L, null);
        when(prescriptions.findByIdAndTenantId(foreign.id(), 1L)).thenReturn(Optional.of(foreign));
        assertEquals("PRESCRIPTION_NOT_FOUND", assertThrows(BusinessException.class,
                () -> snapshots.requireSnapshot(3L, foreign.id())).code());
        verifyNoInteractions(medications);
    }

    private MedicationRequest request(Long id, String status) {
        var item = mock(MedicationRequest.class);
        when(item.id()).thenReturn(id);
        when(item.medicationId()).thenReturn(90L);
        when(item.status()).thenReturn(status);
        when(item.doseValue()).thenReturn(BigDecimal.valueOf(5));
        when(item.frequencyRuleSnapshot()).thenReturn("{\"revision\":7}");
        when(item.medicationSnapshot()).thenReturn("{\"strengthValue\":5}");
        when(item.routeResolutionStatus()).thenReturn("RESOLVED");
        return item;
    }
}
