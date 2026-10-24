package com.rhn.ai.api;

import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class RecordQualityContracts {
    private RecordQualityContracts() {}

    public record RecordQualityRequest(@NotNull @Size(max=9)
            Map<@NotBlank String, @NotNull @Size(max=4000) String> fields) {}
    public record RecordQualityFinding(String code, String kind, String field, String title, String prompt) {}
    public record RecordQualityResult(@Schema(nullable=true) Long runId, String mode, String outcome, String inputHash,
            @Schema(nullable=true) Long baselineDocumentId, int baselineDocumentVersion, Instant assessedAt,
            List<RecordQualityFinding> findings, List<RecordQualityFeedback> feedback, String message) {}
    public record RecordQualityFeedbackRequest(@NotBlank @Size(max=100) String commandCode,
            @NotBlank String action, @Schema(nullable=true) String findingCode,
            @Schema(nullable=true) Long documentId, @Schema(nullable=true) Integer documentVersion) {}
    public record RecordQualityFeedback(Long id, Long runId, String findingCode, String action, String actionText, String actor,
            Instant time, @Schema(nullable=true) Long documentId, @Schema(nullable=true) Integer documentVersion, Map<String,String> changedFieldHashes) {
        public RecordQualityFeedback {
            actionText=switch(action) {
                case "ADOPTED" -> "已采纳，待保存核实";
                case "DISMISSED" -> "已忽略";
                case "MODIFIED" -> "相关字段已修改并保存";
                case "UNCHANGED" -> "已保存，相关字段未修改";
                default -> action;
            };
        }
    }
    public record DecisionFeedbackStatistics(int adopted, int dismissed, int modified, int unchanged) {}
}
