package com.rhn.coordination.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class OutpatientFlowViews {
    private OutpatientFlowViews() {}

    public record BoardView(LocalDate businessDate, Instant refreshedAt, SummaryView summary,
                            List<VisitView> visits) {}

    public record SummaryView(int totalCount, int waitingConsultationCount, int inConsultationCount,
                              int downstreamPendingCount, int exceptionCount, int completedCount) {}

    public record VisitView(
            Long encounterId, String encounterNo, Long residentId, String residentName, String healthRecordNo,
            String gender, String clinicalStatus, String flowStatus, String flowStatusText,
            String nextDestination, String nextRoute, String nextActionText, String attentionReason,
            Instant pendingSince, long pendingMinutes, BigDecimal outstandingAmount,
            Instant registeredAt, Instant startedAt, Instant clinicalCompletedAt,
            List<StageView> stages) {}

    public record StageView(String stageCode, String stageName, String status, String statusText,
                            int totalCount, int pendingCount, String routePath) {}
}
