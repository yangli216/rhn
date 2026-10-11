package com.rhn.ai.api;

import tools.jackson.databind.JsonNode;
import com.rhn.shared.api.PageResult;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class DecisionObservationContracts {
    private DecisionObservationContracts() {}
    public record DecisionRun(Long id, String scene, String mode, String outcome, Instant time, String correlationId,
                      String traceId, String model, String version, String inputHash, Integer latencyMs,
                      Double threshold, boolean modelCalled, boolean judged, boolean uncertain, String comparison, Boolean equal, JsonNode input,
                      JsonNode answers, List<String> selected, List<String> baseline, String exceptionType) {}
    public record DecisionReview(Long id, Long runId, String verdict, String reason, String actor, Instant time) {}
    public record DecisionReviewRequest(@NotBlank String verdict, @NotBlank @Size(max=2000) String reason) {}
    public record DecisionRow(Long id, String scene, String mode, String outcome, Instant time, String traceId,
                      String model, Integer latencyMs, String comparison, Boolean equal, DecisionReview review, boolean uncertain, boolean modelCalled) {}
    public record DecisionDetail(DecisionRun run, List<DecisionReview> reviews) {}
    public record DecisionSceneState(String scene, String label, String mode, String state, Instant lastTriggeredAt) {}
    public record DecisionStatistics(int total, Map<String,Integer> outcomes, int comparable, int equal,
                             int reviewed, Double averageLatencyMs, Integer p95LatencyMs, int modelCalls, int judged, int uncertain) {}
    public record DecisionObservation(PageResult<DecisionRow> records, DecisionStatistics statistics, List<DecisionSceneState> scenes,
                              Long organizationId, Long departmentId, String auditVersion) {}
}
