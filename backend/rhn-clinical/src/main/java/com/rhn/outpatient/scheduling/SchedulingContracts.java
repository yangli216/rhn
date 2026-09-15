package com.rhn.outpatient.scheduling;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

final class SchedulingContracts {
    private SchedulingContracts() {}

    record QuickScheduleRequest(
            ScheduleRegistrationScope registrationScope,
            Long practitionerId,
            @NotNull Long catalogItemId,
            @NotNull LocalDate dateFrom,
            @NotNull LocalDate dateTo,
            @NotEmpty Set<@Min(1) @Max(7) Integer> weekdays,
            @NotEmpty Set<@NotNull ScheduleDayPart> dayParts,
            LocalTime morningStart,
            LocalTime morningEnd,
            LocalTime afternoonStart,
            LocalTime afternoonEnd,
            @NotNull @Min(1) @Max(500) Integer capacity,
            @Size(max = 200) String locationName,
            @NotBlank @Size(max = 128) String idempotencyCode
    ) {}

    record SchedulingBootstrap(
            @DictionaryBinding("SC_SCHEDULE_MANAGEMENT_MODE") String sdManagementMode,
            int defaultCapacity,
            int defaultGenerateDays,
            PeriodDefault morning,
            PeriodDefault afternoon,
            List<PractitionerOption> practitioners
    ) {}

    record PeriodDefault(LocalTime start, LocalTime end) {}

    record PractitionerOption(Long id, String code, String name, Long assignmentId) {}

    record ScheduleView(
            Long id,
            String scheduleCode,
            LocalDate serviceDate,
            @DictionaryBinding("SC_SCHEDULE_DAY_PART") String sdDayPart,
            Instant startAt,
            Instant endAt,
            @DictionaryBinding("SC_REGISTRATION_SCOPE") String sdRegistrationScope,
            Long practitionerId,
            String practitionerName,
            Long departmentId,
            String departmentName,
            Long catalogItemId,
            String serviceCode,
            String serviceName,
            String locationName,
            int totalCount,
            int heldCount,
            int occupiedCount,
            int frozenCount,
            int availableCount,
            @DictionaryBinding("SC_SCHEDULE_STATUS") String sdStatus,
            @DictionaryBinding("SC_SCHEDULE_MANAGEMENT_MODE") String sdManagementMode,
            @DictionaryBinding("SC_BOOKING_POLICY") String sdBookingPolicy,
            @DictionaryBinding("SC_SLOT_MODE") String sdSlotMode,
            java.math.BigDecimal registrationFee,
            String feeCurrencyCode,
            boolean feeConfigured,
            String feePriceDocumentCode
    ) {}

    record QuickScheduleResult(
            Long generationRunId,
            boolean replayed,
            int generatedCount,
            int skippedCount,
            List<ScheduleView> schedules
    ) {}

    record UpdateScheduleRequest(
            @NotNull LocalTime startTime,
            @NotNull LocalTime endTime,
            @NotNull @Min(1) @Max(500) Integer capacity,
            @Size(max = 200) String locationName,
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Size(max = 500) String reason
    ) {}

    record ChangeScheduleStatusRequest(
            @NotNull ScheduleAction action,
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Size(max = 500) String reason
    ) {}

    record ProfessionalScheduleRequest(
            @NotBlank @Size(max = 200) String templateName,
            ScheduleRegistrationScope registrationScope,
            Long practitionerId,
            @NotNull Long catalogItemId,
            @NotNull LocalDate dateFrom,
            @NotNull LocalDate dateTo,
            @NotEmpty Set<@Min(1) @Max(7) Integer> weekdays,
            @NotNull LocalTime startTime,
            @NotNull LocalTime endTime,
            @NotNull @Min(1) @Max(500) Integer capacity,
            @NotNull ProfessionalSlotMode slotMode,
            @Min(5) @Max(120) Integer slotMinutes,
            @Size(max = 200) String locationName,
            @Size(max = 31) List<@Valid ProfessionalExceptionInput> exceptions,
            @NotBlank @Size(max = 128) String idempotencyCode
    ) {}

    record ProfessionalExceptionInput(
            @NotNull LocalDate exceptionDate,
            @NotNull ScheduleExceptionType exceptionType,
            LocalTime startTime,
            LocalTime endTime,
            @Min(1) @Max(500) Integer capacity,
            @Min(5) @Max(120) Integer slotMinutes,
            @NotBlank @Size(max = 500) String reason
    ) {}

    record ProfessionalTemplatePeriodView(
            int dayOfWeek,
            LocalTime startTime,
            LocalTime endTime,
            int capacity,
            @DictionaryBinding("SC_SLOT_MODE") String sdSlotMode,
            Integer slotMinutes
    ) {}

    record ProfessionalExceptionView(
            Long id,
            LocalDate exceptionDate,
            String exceptionType,
            LocalTime startTime,
            LocalTime endTime,
            Integer capacity,
            Integer slotMinutes,
            String reason
    ) {}

    record ProfessionalTemplateView(
            Long id,
            String templateCode,
            String templateName,
            @DictionaryBinding("SC_REGISTRATION_SCOPE") String sdRegistrationScope,
            Long practitionerId,
            String practitionerName,
            Long catalogItemId,
            String serviceCode,
            String serviceName,
            LocalDate validFrom,
            LocalDate validTo,
            String status,
            List<ProfessionalTemplatePeriodView> periods,
            List<ProfessionalExceptionView> exceptions
    ) {}

    record ProfessionalScheduleResult(
            Long generationRunId,
            boolean replayed,
            int generatedCount,
            int skippedCount,
            ProfessionalTemplateView template,
            List<ScheduleView> schedules
    ) {}
}
