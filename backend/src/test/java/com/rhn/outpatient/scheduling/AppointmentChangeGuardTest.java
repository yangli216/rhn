package com.rhn.outpatient.scheduling;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.AppointmentChangeGuard;
import com.rhn.outpatient.scheduling.AppointmentContracts.CancelAppointmentRequest;
import com.rhn.outpatient.scheduling.AppointmentContracts.RescheduleAppointmentRequest;
import com.rhn.platform.numbering.api.BusinessNumberGenerator;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 预约取消/改约遇到进行中的挂号收费意向时必须拒绝，不能释放号源。 */
class AppointmentChangeGuardTest {
    private static final Long TENANT = 1L;
    private static final Long APPOINTMENT_ID = 30L;

    private final AppointmentRepository appointments = mock(AppointmentRepository.class);
    private final ScheduleSlotPoolRepository pools = mock(ScheduleSlotPoolRepository.class);
    private final ServiceScheduleRepository schedules = mock(ServiceScheduleRepository.class);
    private final AppointmentChangeGuard guard = mock(AppointmentChangeGuard.class);
    private final AppointmentApplicationService service;

    AppointmentChangeGuardTest() {
        var contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT, 2L, "desk", "corr", Set.of(),
                10L, 11L, "DEPARTMENT", Set.of(10L), Set.of(11L)));
        service = new AppointmentApplicationService(appointments, mock(AppointmentEventRepository.class),
                mock(PatientRegistrationRepository.class), schedules, pools, mock(SlotEventRepository.class),
                mock(ResidentDirectory.class), contexts, mock(BusinessNumberGenerator.class), List.of(guard));
        var appointment = mock(Appointment.class);
        when(appointment.id()).thenReturn(APPOINTMENT_ID);
        when(appointment.scheduleId()).thenReturn(40L);
        when(appointment.status()).thenReturn(AppointmentStatus.BOOKED);
        when(appointments.findWithLockByIdAndTenantId(APPOINTMENT_ID, TENANT)).thenReturn(Optional.of(appointment));
        var schedule = mock(ServiceSchedule.class);
        when(schedule.id()).thenReturn(40L);
        when(schedule.organizationId()).thenReturn(10L);
        when(schedule.departmentId()).thenReturn(11L);
        when(schedules.findByIdAndTenantId(any(), any())).thenReturn(Optional.of(schedule));
        when(guard.registrationInProgress(TENANT, APPOINTMENT_ID)).thenReturn(true);
    }

    @Test
    void cancelIsRejectedWhileRegistrationIntentIsActive() {
        assertThatThrownBy(() -> service.cancel(APPOINTMENT_ID, new CancelAppointmentRequest("C1", "患者取消")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.code()).isEqualTo("APPOINTMENT_REGISTRATION_IN_PROGRESS"));
        verify(pools, never()).findWithLockByIdAndTenantId(any(), any());
    }

    @Test
    void rescheduleIsRejectedWhileRegistrationIntentIsActive() {
        assertThatThrownBy(() -> service.reschedule(APPOINTMENT_ID, new RescheduleAppointmentRequest(41L, "R1", "改期")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.code()).isEqualTo("APPOINTMENT_REGISTRATION_IN_PROGRESS"));
        verify(pools, never()).findWithLockByIdAndTenantId(any(), any());
    }
}
