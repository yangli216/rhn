package com.rhn.treatment.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record TreatmentExecutionTaskView(
        Long id, long revision, String taskNo, String taskType, String status,
        Long residentId, String residentName, String healthRecordNo, Long encounterId,
        Long organizationId, Long departmentId, Long sourceGroupId,
        Instant createdAt, Instant startedAt, Long startedBy,
        String verificationMethod, String executionSite, String startNote,
        Instant completedAt, Long completedBy, String resultCode, String completionNote,
        boolean adverseReaction, String adverseReactionDetail, String exceptionNote,
        List<TreatmentExecutionItemView> items) {

    public record TreatmentExecutionItemView(
            Long id, String sourceType, Long sourceId, Long parentSourceId, String requestNo,
            String itemCode, String itemName, BigDecimal doseValue, String doseUnit,
            String routeCode, String frequencyCode, Long frequencyId, String frequencyName,
            String frequencyRule, BigDecimal durationValue, String durationUnit,
            boolean skinTestRequired, String skinTestStatus, String skinTestResult, Long skinTestEventId,
            boolean settlementRequired, Long settlementId,
            boolean fulfillmentRequired, Long fulfillmentId, String fulfillmentStatus,
            boolean cancelled, boolean ready, Instant createdAt) {}
}
