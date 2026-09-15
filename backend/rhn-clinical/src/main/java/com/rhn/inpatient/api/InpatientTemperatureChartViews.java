package com.rhn.inpatient.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class InpatientTemperatureChartViews {
    private InpatientTemperatureChartViews() {
    }

    public record WeekView(
            Long episodeId, LocalDate weekStart, LocalDate weekEnd, boolean readOnly,
            List<VitalObservationView> observations, List<ChartEventView> events) {
        public WeekView {
            observations = List.copyOf(observations);
            events = List.copyOf(events);
        }
    }

    public record VitalObservationView(
            Long id, Instant observedAt,
            BigDecimal temperatureCelsius, String temperatureSite,
            BigDecimal coolingTemperatureCelsius, Instant coolingObservedAt,
            BigDecimal pulseRate, BigDecimal respiratoryRate,
            BigDecimal systolicBloodPressure, BigDecimal diastolicBloodPressure,
            BigDecimal oxygenSaturation, BigDecimal bodyWeightKg,
            BigDecimal intakeVolumeMl, BigDecimal outputVolumeMl,
            String status, String recorderName, Instant signedAt) {
    }

    public record ChartEventView(
            Long id, String eventType, Instant occurredAt, String displayText,
            String status, String recorderName, Instant signedAt) {
    }
}
