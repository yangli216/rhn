package com.rhn.outpatient.scheduling;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.RegistrationValidityPolicy;
import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.configuration.api.ConfigurationValue;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.platform.printing.api.PrintDataRequest;
import com.rhn.platform.printing.api.PrintSourceRef;
import com.rhn.platform.printing.api.PrintTaskCodes;
import com.rhn.platform.printing.api.RegistrationBillingDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.queueing.api.QueueingDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PatientRegistrationPrintDataProviderTest {
    private final PatientRegistrationRepository registrations = mock(PatientRegistrationRepository.class);
    private final ServiceScheduleRepository schedules = mock(ServiceScheduleRepository.class);
    private final QueueingDirectory queueing = mock(QueueingDirectory.class);
    private final ResidentDirectory residents = mock(ResidentDirectory.class);
    private final OrganizationDirectory organizations = mock(OrganizationDirectory.class);
    private final RegistrationBillingDirectory billing = mock(RegistrationBillingDirectory.class);
    private final ConfigurationDirectory configuration = mock(ConfigurationDirectory.class);
    private final RegistrationValidityPolicy validity = new RegistrationValidityPolicy(configuration, "", "");
    private final ExecutionContextProvider contexts = () -> new ExecutionContext(1L, 6L, "test", "test", Set.of(),
            9L, 10L, "TENANT", Set.of(4L), Set.of(5L));
    private final PatientRegistrationPrintDataProvider provider = new PatientRegistrationPrintDataProvider(
            registrations, schedules, queueing, residents, organizations, billing, validity, contexts);

    @BeforeEach
    void setUp() {
        TenantContext.set(1L);
        var registration = mock(PatientRegistration.class);
        when(registrations.findByIdAndTenantId(2L, 1L)).thenReturn(Optional.of(registration));
        when(registration.id()).thenReturn(2L);
        when(registration.encounterId()).thenReturn(3L);
        when(registration.organizationId()).thenReturn(4L);
        when(registration.departmentId()).thenReturn(5L);
        when(registration.residentId()).thenReturn(7L);
        when(registration.scheduleId()).thenReturn(8L);
        when(registration.registeredAt()).thenReturn(Instant.parse("2026-09-06T06:15:30Z"));
        when(schedules.findByIdAndTenantId(8L, 1L)).thenReturn(Optional.empty());
        when(queueing.requireBySource("PAT_REG", 2L)).thenReturn(mock(QueueingDirectory.TicketSnapshot.class));
        when(residents.requireSnapshot(7L)).thenReturn(mock(ResidentDirectory.ResidentSnapshot.class));
        when(organizations.requireOrganization(1L, 4L)).thenReturn(mock(OrganizationView.class));
        var department = mock(DepartmentView.class);
        when(department.name()).thenReturn("全科门诊");
        when(organizations.requireDepartment(1L, 4L, 5L)).thenReturn(department);
        when(billing.findPaymentSnapshotByEncounterId(1L, 3L)).thenReturn(Optional.empty());
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @ParameterizedTest
    @CsvSource({
            "1,END_OF_DAY,2026-09-07 00:00:00前",
            "3,END_OF_DAY,2026-09-09 00:00:00前",
            "1,EXACT_DURATION,2026-09-07 14:15:30前",
            "3,EXACT_DURATION,2026-09-09 14:15:30前"
    })
    void ticket_uses_the_scoped_validity_policy(int days, String mode, String expected) {
        configure(RegistrationValidityPolicy.PARAMETER_DAYS_KEY, days);
        configure(RegistrationValidityPolicy.PARAMETER_CUTOFF_MODE_KEY, mode);
        assertCutoff(expected);
    }

    @Test
    void ticket_uses_the_existing_default_end_of_day_policy() {
        assertCutoff("2026-09-07 00:00:00前");
    }

    @Test
    void missing_schedule_does_not_invent_a_consultation_room() {
        assertLocation("未记录");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n"})
    void missing_schedule_location_does_not_invent_a_consultation_room(String location) {
        var schedule = mock(ServiceSchedule.class);
        when(schedule.locationName()).thenReturn(location);
        when(schedules.findByIdAndTenantId(8L, 1L)).thenReturn(Optional.of(schedule));
        assertLocation("未记录");
    }

    @ParameterizedTest
    @ValueSource(strings = {"东楼二层203诊室", "全科门诊 诊室"})
    void recorded_schedule_location_is_preserved(String location) {
        var schedule = mock(ServiceSchedule.class);
        when(schedule.locationName()).thenReturn(location);
        when(schedules.findByIdAndTenantId(8L, 1L)).thenReturn(Optional.of(schedule));
        assertLocation(location);
    }

    @Test
    void missing_schedule_does_not_invent_a_practitioner_name() {
        assertPractitionerName("未记录");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n"})
    void missing_practitioner_name_is_printed_as_unrecorded(String name) {
        var schedule = mock(ServiceSchedule.class);
        when(schedule.practitionerName()).thenReturn(name);
        when(schedules.findByIdAndTenantId(8L, 1L)).thenReturn(Optional.of(schedule));
        assertPractitionerName("未记录");
    }

    @ParameterizedTest
    @ValueSource(strings = {"王医生", "普通门诊"})
    void recorded_practitioner_name_is_preserved(String name) {
        var schedule = mock(ServiceSchedule.class);
        when(schedule.practitionerName()).thenReturn(name);
        when(schedules.findByIdAndTenantId(8L, 1L)).thenReturn(Optional.of(schedule));
        assertPractitionerName(name);
    }

    private void assertPractitionerName(String expected) {
        var snapshot = provider.load(new PrintDataRequest(PrintTaskCodes.OUTPATIENT_REGISTRATION_TICKET,
                new PrintSourceRef("PatientRegistration", 2L, 3L)));
        assertThat(snapshot.payload().get("practitionerName")).isEqualTo(expected);
    }

    private void assertLocation(String expected) {
        var snapshot = provider.load(new PrintDataRequest(PrintTaskCodes.OUTPATIENT_REGISTRATION_TICKET,
                new PrintSourceRef("PatientRegistration", 2L, 3L)));
        assertThat(snapshot.payload().get("locationName")).isEqualTo(expected);
        assertThat(snapshot.payload().get("departmentName")).isEqualTo("全科门诊");
    }

    private void configure(String key, Object value) {
        var configured = mock(ConfigurationValue.class);
        when(configured.value()).thenReturn(JsonMapper.builder().build().valueToTree(value));
        when(configuration.resolveCurrent(1L, 6L, 4L, 5L, key)).thenReturn(configured);
    }

    private void assertCutoff(String expected) {
        var snapshot = provider.load(new PrintDataRequest(PrintTaskCodes.OUTPATIENT_REGISTRATION_TICKET,
                new PrintSourceRef("PatientRegistration", 2L, 3L)));
        assertThat(snapshot.payload().get("validUntilText")).isEqualTo(expected);
        verify(configuration).resolveCurrent(1L, 6L, 4L, 5L, RegistrationValidityPolicy.PARAMETER_DAYS_KEY);
        verify(configuration).resolveCurrent(1L, 6L, 4L, 5L, RegistrationValidityPolicy.PARAMETER_CUTOFF_MODE_KEY);
    }
}
