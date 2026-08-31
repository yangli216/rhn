package com.rhn.inpatient.web;

import com.rhn.inpatient.api.InpatientPermissions;
import com.rhn.inpatient.api.InpatientTemperatureChartViews.ChartEventView;
import com.rhn.inpatient.api.InpatientTemperatureChartViews.VitalObservationView;
import com.rhn.inpatient.api.InpatientTemperatureChartViews.WeekView;
import com.rhn.inpatient.application.InpatientTemperatureChartService;
import com.rhn.inpatient.application.InpatientTemperatureChartService.ChartEventCommand;
import com.rhn.inpatient.application.InpatientTemperatureChartService.ObservationCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/inpatient/episodes/{episodeId}")
@PreAuthorize(InpatientPermissions.ACCESS)
public class InpatientTemperatureChartController {
    private final InpatientTemperatureChartService service;

    public InpatientTemperatureChartController(InpatientTemperatureChartService service) {
        this.service = service;
    }

    @GetMapping("/temperature-chart")
    WeekView week(
            @PathVariable Long episodeId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate weekStart) {
        return service.week(episodeId, weekStart);
    }

    @PostMapping("/vital-observations")
    @ResponseStatus(HttpStatus.CREATED)
    VitalObservationView recordObservations(
            @PathVariable Long episodeId, @Valid @RequestBody ObservationRequest input) {
        return service.recordObservations(episodeId, new ObservationCommand(
                input.observedAt(), input.temperatureSite(), input.temperatureCelsius(),
                input.coolingTemperatureCelsius(), input.coolingObservedAt(),
                input.pulseRate(), input.respiratoryRate(),
                input.systolicBloodPressure(), input.diastolicBloodPressure(),
                input.oxygenSaturation(), input.bodyWeightKg(),
                input.intakeVolumeMl(), input.outputVolumeMl(), input.commandCode()));
    }

    @PostMapping("/chart-events")
    @ResponseStatus(HttpStatus.CREATED)
    ChartEventView recordChartEvent(
            @PathVariable Long episodeId, @Valid @RequestBody ChartEventRequest input) {
        return service.recordChartEvent(episodeId, new ChartEventCommand(
                input.eventType(), input.occurredAt(), input.displayText(), input.commandCode()));
    }

    public record ObservationRequest(
            @NotNull Instant observedAt,
            @Pattern(regexp = "AXILLARY|ORAL|RECTAL|EAR|FOREHEAD") String temperatureSite,
            @DecimalMin("30") @DecimalMax("45") @Digits(integer = 2, fraction = 4)
            BigDecimal temperatureCelsius,
            @DecimalMin("30") @DecimalMax("45") @Digits(integer = 2, fraction = 4)
            BigDecimal coolingTemperatureCelsius,
            Instant coolingObservedAt,
            @DecimalMin("0") @DecimalMax("300") @Digits(integer = 3, fraction = 4)
            BigDecimal pulseRate,
            @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 4)
            BigDecimal respiratoryRate,
            @DecimalMin("20") @DecimalMax("300") @Digits(integer = 3, fraction = 4)
            BigDecimal systolicBloodPressure,
            @DecimalMin("10") @DecimalMax("200") @Digits(integer = 3, fraction = 4)
            BigDecimal diastolicBloodPressure,
            @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 4)
            BigDecimal oxygenSaturation,
            @DecimalMin("0.1") @DecimalMax("500") @Digits(integer = 3, fraction = 4)
            BigDecimal bodyWeightKg,
            @DecimalMin("0") @DecimalMax("100000") @Digits(integer = 6, fraction = 4)
            BigDecimal intakeVolumeMl,
            @DecimalMin("0") @DecimalMax("100000") @Digits(integer = 6, fraction = 4)
            BigDecimal outputVolumeMl,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record ChartEventRequest(
            @NotBlank String eventType,
            @NotNull Instant occurredAt,
            @NotBlank @Size(max = 200) String displayText,
            @NotBlank @Size(max = 128) String commandCode) {
    }
}
