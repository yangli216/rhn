package com.rhn.healthcore.allergy;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.masterdata.api.MedicationTerminologyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AllergyServiceTest {
    private final AllergyIntoleranceRepository repository = mock(AllergyIntoleranceRepository.class);
    private final ResidentDirectory residents = mock(ResidentDirectory.class);
    private final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    private final DomainEventPublisher events = mock(DomainEventPublisher.class);
    private final MedicationTerminologyDirectory terms = mock(MedicationTerminologyDirectory.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final AllergyService service = new AllergyService(repository, residents, contexts, events, terms, jdbc);

    @BeforeEach void setUp() {
        when(residents.resolveCanonicalResidentId(anyLong())).thenAnswer(call -> call.getArgument(0));
        context(20L, 21L, Set.of(20L, 40L));
        when(repository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }
    private void context(Long org, Long dept, Set<Long> accessible) {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(10L, 11L, "tester", "test",
                Set.of(), org, dept, "ORGANIZATION", accessible, Set.of(), 12L));
    }
    private RecordAllergyRequest input(Long encounter) {
        return new RecordAllergyRequest(encounter, null, "ALLERGY", "DRUG", "HIGH", null,
                "PATIENT", null, "PENICILLIN", "青霉素", null, null);
    }
    private void encounter(Long org, Long dept, Long patient) {
        Map<String, Object> row = new HashMap<>();
        row.put("ID_ORG", org); row.put("ID_DEPT", dept); row.put("ID_PAT", patient);
        when(jdbc.queryForList(anyString(), eq(10L), eq(50L))).thenReturn(List.of(row));
    }
    private void expectFailure(String code, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.code()).isEqualTo(code));
        verify(repository, never()).saveAndFlush(any());
        verifyNoInteractions(events);
    }
    @Test void records_current_context_without_seed_identifiers_when_no_encounter_is_supplied() {
        service.record(30L, input(null));
        verify(repository).saveAndFlush(argThat(value -> value.organizationId().equals(20L)
                && value.departmentId().equals(21L) && value.residentId().equals(30L)));
    }
    @Test void preserves_encounter_ownership_and_event_organization_across_authorized_organizations() {
        encounter(40L, 41L, 30L);
        service.record(30L, input(50L));
        verify(repository).saveAndFlush(argThat(value -> value.organizationId().equals(40L) && value.departmentId().equals(41L)));
        verify(events).publish(eq(10L), eq(40L), eq("ALLERGY_RECORDED"), eq(1), eq("AllergyIntolerance"),
                anyLong(), eq(0L), eq(30L), any(), anyMap());
    }
    @Test void missing_context_never_falls_back_to_organization_one() {
        context(null, null, Set.of());
        expectFailure("ALLERGY_ORGANIZATION_REQUIRED", () -> service.record(30L, input(null)));
    }
    @Test void missing_department_is_rejected() {
        context(20L, null, Set.of(20L));
        expectFailure("ALLERGY_ORGANIZATION_REQUIRED", () -> service.record(30L, input(null)));
    }
    @Test void missing_encounter_is_not_replaced_with_operator_context() {
        expectFailure("ALLERGY_ENCOUNTER_NOT_FOUND", () -> service.record(30L, input(50L)));
    }
    @Test void incomplete_encounter_ownership_is_not_mixed_with_operator_context() {
        encounter(40L, null, 30L);
        expectFailure("ALLERGY_ORGANIZATION_REQUIRED", () -> service.record(30L, input(50L)));
    }
    @Test void rejects_another_patients_encounter() {
        encounter(40L, 41L, 99L);
        expectFailure("ALLERGY_ENCOUNTER_PATIENT_MISMATCH", () -> service.record(30L, input(50L)));
    }
    @Test void supports_merged_patient_identifiers() {
        encounter(40L, 41L, 99L);
        when(residents.resolveCanonicalResidentId(99L)).thenReturn(30L);
        service.record(30L, input(50L));
        verify(repository).saveAndFlush(argThat(value -> value.residentId().equals(30L)));
    }
    @Test void rejects_encounters_from_inaccessible_organizations() {
        encounter(90L, 91L, 30L);
        expectFailure("ALLERGY_ORGANIZATION_FORBIDDEN", () -> service.record(30L, input(50L)));
    }
    @Test void positive_skin_test_validates_ownership_before_inactivating_existing_assertions() {
        context(20L, null, Set.of(20L));
        expectFailure("ALLERGY_ORGANIZATION_REQUIRED", () -> service.recordPositiveDrugSkinTest(30L, null,
                "PENICILLIN", "青霉素", "皮试阳性", null, 80L));
        verifyNoInteractions(repository);
    }
}
