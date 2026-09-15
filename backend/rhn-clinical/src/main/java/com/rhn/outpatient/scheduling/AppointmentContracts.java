package com.rhn.outpatient.scheduling;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;

final class AppointmentContracts {
    private AppointmentContracts() {}

    record CreateAppointmentRequest(
            @NotNull Long residentId,
            @NotNull Long scheduleId,
            @NotBlank @Size(max = 24) String bookingSource,
            @Size(max = 500) String reason,
            @NotBlank @Size(max = 128) String idempotencyCode
    ) {}

    record CancelAppointmentRequest(
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Size(max = 500) String reason
    ) {}

    record RescheduleAppointmentRequest(
            @NotNull Long targetScheduleId,
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Size(max = 500) String reason
    ) {}

    record AppointmentView(
            Long id,
            long revision,
            String appointmentNo,
            Long residentId,
            String healthRecordNo,
            String residentName,
            String gender,
            LocalDate birthDate,
            Long scheduleId,
            String scheduleCode,
            LocalDate serviceDate,
            @DictionaryBinding("SC_SCHEDULE_DAY_PART") String sdDayPart,
            Instant startAt,
            Instant endAt,
            Long practitionerId,
            String practitionerName,
            String serviceCode,
            String serviceName,
            String locationName,
            @DictionaryBinding("SC_APPOINTMENT_STATUS") String sdStatus,
            @DictionaryBinding("SC_APPOINTMENT_SOURCE") String sdBookingSource,
            Instant confirmedAt,
            Instant checkedInAt,
            Instant cancelledAt,
            String cancellationReason,
            Long rescheduledFromId,
            Instant createdAt,
            Instant updatedAt
    ) {}
}
