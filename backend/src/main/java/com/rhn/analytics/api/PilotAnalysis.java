package com.rhn.analytics.api;

import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.time.Instant;
import java.util.List;

/** Versioned pilot transport, intentionally separate from the full A04 AnalysisSpec. */
public final class PilotAnalysis {
    private PilotAnalysis() {}
    public enum InterpretStatus { READY, UNSUPPORTED, CLARIFY }
    public record InterpretRequest(@NotBlank @Size(max=2000) String text, @NotNull @Valid Query base, @NotNull Chart chart) {}
    public record Interpretation(InterpretStatus status, String message, Query query, Chart chart) {}
    public enum Metric { REGISTERED, CANCELLED, COMPLETED, CANCELLATION_RATE }
    public enum Dimension { DAY, MONTH, DEPARTMENT }
    public enum Scope { CURRENT, AUTHORIZED }
    public enum Chart { BAR, LINE, TABLE }
    @Schema(name="PilotAnalysisQuery")
    public record Query(@NotNull Metric metric, @NotNull Dimension dimension, @NotNull Scope scope,
                        @NotNull LocalDate startDate, @NotNull LocalDate endDate) {}
    @Schema(name="PilotAnalysisRow")
    public record Row(String label, long registered, long cancelled, long completed, double value) {}
    @Schema(name="PilotAnalysisResult")
    public record Result(Query query, String metricName, String unit, String scopeName, String timezone,
                         Instant fetchedAt, List<Row> rows, long registered, long cancelled, long completed,
                         double total, Double changePercent, LocalDate comparisonStart, LocalDate comparisonEnd,
                         String definition) {}
    @Schema(name="PilotAnalysisSave")
    public record Save(@NotBlank @Size(max=80) String title, @NotNull @Valid Query query, @NotNull Chart chart) {}
    @Schema(name="PilotAnalysisSaved")
    public record Saved(Long id, String title, Query query, Chart chart, Instant savedAt) {}
}
