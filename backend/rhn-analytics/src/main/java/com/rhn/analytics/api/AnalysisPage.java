package com.rhn.analytics.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import jakarta.validation.Valid;
import java.time.*;
import java.util.List;
import com.rhn.shared.reporting.ReportModel.Measure;

public final class AnalysisPage {
    private AnalysisPage() {}
    public enum Template { AUTO, LIST, RANKING, TREND, COMPARISON, DASHBOARD, CUSTOM }
    public enum WidgetType { KPI, BAR, LINE, TABLE }
    @Schema(name="AnalysisPageWidget")
    public record Widget(@NotBlank @Size(max=80) String title, @NotNull WidgetType type,
                         @NotEmpty @Size(max=4) List<String> metrics) {}
    public enum Dimension { DAY, MONTH, DEPARTMENT, DIAGNOSIS, ITEM, ORDER_TYPE, STATUS }
    public enum PeriodKind { MONTH_TO_DATE, LAST_MONTH, LAST_30_DAYS, YEAR_TO_DATE, FIXED }
    public enum Status { READY, CLARIFY, UNSUPPORTED }
    @Schema(name="AnalysisPagePeriod")
    public record Period(@NotNull PeriodKind kind, LocalDate startDate, LocalDate endDate) {}
    @Schema(name="AnalysisPageSpec")
    public record Spec(@NotBlank @Size(max=80) String title, @NotNull Template template,
                       @NotEmpty @Size(max=4) List<String> metrics, @NotNull Dimension dimension,
                       @NotNull PilotAnalysis.Scope scope, @NotNull @Valid Period period,
                       @Min(1) @Max(100) int limit, @Size(max=4) List<Measure> measures, @Size(max=8) List<@Valid Widget> widgets) {
        public Spec(String title, Template template, List<String> metrics, Dimension dimension,
                    PilotAnalysis.Scope scope, Period period, int limit, List<Measure> measures) {
            this(title,template,metrics,dimension,scope,period,limit,measures,null);
        }
        public Spec(String title, Template template, List<String> metrics, Dimension dimension,
                    PilotAnalysis.Scope scope, Period period, int limit) {
            this(title,template,metrics,dimension,scope,period,limit,null);
        }
    }
    @Schema(name="AnalysisPageMetric")
    public record Metric(String code, String name, String unit, String definition, List<Dimension> dimensions) {}
    @Schema(name="AnalysisPageGenerate")
    public record Generate(@NotBlank @Size(max=2000) String requirement, @NotNull Template template,
                           @Valid Spec currentSpec, @Size(max=20) List<@NotNull @Valid Turn> history) {
        public Generate(String requirement, Template template) { this(requirement,template,null,null); }
    }
    public enum Speaker { USER, ASSISTANT }
    @Schema(name="AnalysisPageTurn")
    public record Turn(@NotNull Speaker role, @NotBlank @Size(max=2000) String content) {}
    @Schema(name="AnalysisPageProposal")
    public record Proposal(Status status, String message, Spec spec) {}
    @Schema(name="AnalysisPagePoint")
    public record Point(String key, String label, double value) {}
    @Schema(name="AnalysisPageSeries")
    public record Series(String code, String name, String unit, String definition, double total,
                         int groupCount, List<Point> points) {}
    @Schema(name="AnalysisPageResult")
    public record Result(Spec spec, LocalDate startDate, LocalDate endDate, String scopeName,
                         String timezone, Instant fetchedAt, List<Series> series) {}
    @Schema(name="AnalysisPageSaved")
    public record Saved(Long id, Spec spec, Instant savedAt, Long functionId, int version, boolean archived) {
        public Saved(Long id, Spec spec, Instant savedAt) { this(id, spec, savedAt, id, 1, false); }
    }
    @Schema(name="AnalysisPageRename")
    public record Rename(@NotBlank @Size(max=80) String title) {}
    @Schema(name="AnalysisPageArchive")
    public record Archive(boolean archived) {}
}
