package com.rhn.billing.application;

import com.rhn.billing.domain.PatientAccount;
import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InsuranceQuickSubmissionResolverTest {
    final PatientAccount account = mock(PatientAccount.class);
    final EncounterDirectory encounters = mock(EncounterDirectory.class);
    final EncounterDiagnosisDirectory diagnoses = mock(EncounterDiagnosisDirectory.class);
    final OrganizationDirectory organizations = mock(OrganizationDirectory.class);
    final JsonCodec json = mock(JsonCodec.class);
    final Instant started = Instant.parse("2026-10-03T23:30:00Z");
    final InsuranceQuickSubmissionProperties.Registration registration = registration(1L, "360100", Map.of("treating-doctor", "REGISTERED-DOCTOR"));
    InsuranceQuickSubmissionResolver resolver;

    @BeforeEach void setup() {
        when(account.tenantId()).thenReturn(1L); when(account.organizationId()).thenReturn(2L);
        when(account.departmentId()).thenReturn(3L); when(account.residentId()).thenReturn(4L);
        when(account.encounterId()).thenReturn(5L); when(account.accountType()).thenReturn("OUTPATIENT");
        var encounter = new EncounterDirectory.EncounterSnapshot(5L, 1L, 4L, 2L, 3L, "E-1", "treating-doctor",
                "IN_PROGRESS", 1L, "科室", started.minusSeconds(3600));
        when(encounters.requireOrganizationAccessibleService(5L)).thenReturn(new EncounterDirectory.EncounterServiceSnapshot(encounter, started, null));
        var organization = mock(OrganizationView.class);
        when(organization.timezoneCode()).thenReturn("Asia/Shanghai");
        when(organizations.requireOrganization(1L, 2L)).thenReturn(organization);
        when(diagnoses.findActiveDiagnoses(1L, 5L, "ENCOUNTER")).thenReturn(List.of(diagnosis("I10")));
        when(json.write(any())).thenAnswer(call -> JsonMapper.builder().build().writeValueAsString(call.getArgument(0)));
        resolver = resolver(List.of(registration));
    }
    private InsuranceQuickSubmissionResolver resolver(List<InsuranceQuickSubmissionProperties.Registration> registrations) {
        return new InsuranceQuickSubmissionResolver(new InsuranceQuickSubmissionProperties(registrations), encounters, diagnoses, organizations, json);
    }
    private static InsuranceQuickSubmissionProperties.Registration registration(Long tenant, String region, Map<String,String> doctors) {
        return new InsuranceQuickSubmissionProperties.Registration(tenant, 2L, 3L, "310", region,
                "REGISTERED-HOSPITAL", "REGISTERED-DEPT", "INSURANCE-CATALOG", doctors);
    }
    private static EncounterDiagnosisDirectory.DiagnosisSnapshot diagnosis(String code) {
        return new EncounterDiagnosisDirectory.DiagnosisSnapshot(6L, 5L, "ENCOUNTER", code, "测试诊断", "PRIMARY", "CONFIRMED", "ACTIVE");
    }
    private InsuranceQuickSubmissionResolver.Submission submit() { return resolver.resolve(account, resolver.visit(account), "310", null); }

    @Test void usesRegisteredProviderAndTreatingDoctorWithActualServiceDateAndDiagnosisDigest() {
        var visit = resolver.visit(account);
        assertEquals(started, visit.startedAt());
        assertEquals("2026-10-04", visit.serviceDate().toString());
        var result = submit();
        assertEquals("REGISTERED-HOSPITAL", result.organizationCode());
        assertEquals("REGISTERED-DEPT", result.departmentCode());
        assertEquals("REGISTERED-DOCTOR", result.practitionerCode());
        assertEquals("360100", result.regionCode());
        assertTrue(result.diagnosisDigest().matches("SHA256-[0-9a-f]{64}"));
        when(diagnoses.findActiveDiagnoses(1L, 5L, "ENCOUNTER")).thenReturn(List.of(diagnosis("E11")));
        assertNotEquals(result.diagnosisDigest(), submit().diagnosisDigest());
    }
    @Test void missingOrOtherTenantRegistrationCannotSupplyIdentifiers() {
        resolver = resolver(List.of()); assertEquals("INSURANCE_REGISTRATION_UNCONFIRMED", assertThrows(BusinessException.class, this::submit).code());
        resolver = resolver(List.of(registration(99L, "360100", Map.of("treating-doctor", "D"))));
        assertThrows(BusinessException.class, this::submit);
    }
    @Test void ambiguousOrWrongRegionCannotPickAnArbitraryRegistration() {
        resolver = resolver(List.of(registration, registration(1L, "330100", Map.of("treating-doctor", "D"))));
        assertThrows(BusinessException.class, this::submit);
        assertEquals("330100", resolver.resolve(account, resolver.visit(account), "310", "330100").regionCode());
        assertThrows(BusinessException.class, () -> resolver.resolve(account, resolver.visit(account), "310", "999999"));
    }
    @Test void missingTreatingDoctorDoesNotUseCashierIdentity() {
        resolver = resolver(List.of(registration(1L, "360100", Map.of("cashier", "CASHIER-CODE"))));
        assertThrows(BusinessException.class, this::submit);
    }
    @Test void missingOrUnconfirmedDiagnosesDoNotGetAPlaceholderDigest() {
        when(diagnoses.findActiveDiagnoses(1L, 5L, "ENCOUNTER")).thenReturn(List.of());
        assertEquals("INSURANCE_DIAGNOSES_UNCONFIRMED", assertThrows(BusinessException.class, this::submit).code());
        when(diagnoses.findActiveDiagnoses(1L, 5L, "ENCOUNTER")).thenReturn(List.of(new EncounterDiagnosisDirectory.DiagnosisSnapshot(
                6L, 5L, "ENCOUNTER", "I10", "诊断", "PRIMARY", "UNCONFIRMED", "ACTIVE")));
        assertThrows(BusinessException.class, this::submit);
    }
    @Test void digestIsStableForTheSameDiagnosesInDifferentReadOrder() {
        var a = diagnosis("I10"); var b = diagnosis("E11");
        when(diagnoses.findActiveDiagnoses(1L, 5L, "ENCOUNTER")).thenReturn(List.of(a,b));
        String first = submit().diagnosisDigest();
        when(diagnoses.findActiveDiagnoses(1L, 5L, "ENCOUNTER")).thenReturn(List.of(b,a));
        assertEquals(first, submit().diagnosisDigest());
    }
    @Test void noActualStartTimeCannotUseCurrentTimeOrRegistrationTime() {
        var encounter = encounters.requireOrganizationAccessibleService(5L).encounter();
        when(encounters.requireOrganizationAccessibleService(5L)).thenReturn(new EncounterDirectory.EncounterServiceSnapshot(encounter, null, null));
        assertEquals("INSURANCE_ENCOUNTER_INCOMPLETE", assertThrows(BusinessException.class, () -> resolver.visit(account)).code());
    }
    @Test void mismatchedEncounterAndMissingTimezoneBlockAssembly() {
        when(account.residentId()).thenReturn(99L);
        assertEquals("INSURANCE_ENCOUNTER_MISMATCH", assertThrows(BusinessException.class, () -> resolver.visit(account)).code());
        when(account.residentId()).thenReturn(4L);
        when(organizations.requireOrganization(1L, 2L).timezoneCode()).thenReturn(null);
        assertEquals("INSURANCE_TIMEZONE_REQUIRED", assertThrows(BusinessException.class, () -> resolver.visit(account)).code());
    }
    @Test void explicitServiceDateUsesOrganizationTimezoneAndNeverDefaultsMissingFacts() {
        assertEquals("2026-10-04", resolver.serviceDate(account, started).toString());
        when(organizations.requireOrganization(1L, 2L).timezoneCode()).thenReturn("America/New_York");
        assertEquals("2026-10-03", resolver.serviceDate(account, started).toString());
        assertEquals("INSURANCE_SERVICE_TIME_REQUIRED", assertThrows(BusinessException.class,
                () -> resolver.serviceDate(account, null)).code());
        when(organizations.requireOrganization(1L, 2L).timezoneCode()).thenReturn("invalid-zone");
        assertEquals("INSURANCE_TIMEZONE_REQUIRED", assertThrows(BusinessException.class,
                () -> resolver.serviceDate(account, started)).code());
    }
}
