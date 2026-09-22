package com.rhn.treatment.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public record SkinTestWorkItemView(
        Long medicationRequestId, long medicationRequestRevision, String requestNo,
        Long residentId, String residentName, String healthRecordNo,
        String gender, LocalDate birthDate, Long encounterId,
        Long organizationId, Long departmentId, Long medicationId,
        String medicationCode, String medicationName, String itemName,
        String routeCode, BigDecimal doseValue, String doseUnit,
        String configuredTestMethod, String configuredSolutionMode,
        Integer configuredObservationMinutes, Integer resultValidityHours,
        String configurationInstructions,
        boolean settlementRequiredBeforeStart, boolean dispenseRequiredBeforeStart,
        String status, String gateMessage,
        Long eventId, Long eventRevision, Integer attemptNo,
        String testMethod, boolean originalSolution, Long solutionCatalogItemId,
        String solutionName, Long stockLotId, String lotNo,
        BigDecimal concentration, String concentrationUnit, String bodySite, String verificationMethod,
        Integer observationMinutes, Instant startedAt, Instant completedAt,
        String result, BigDecimal whealDiameterMm, BigDecimal flareDiameterMm,
        String reactionDescription, String earlyReadReason,
        Long performedByUserId, Long performedByPractitionerId,
        Long readByUserId, Long readByPractitionerId,
        Long verifiedByUserId, Long verifiedByPractitionerId,
        String verifiedByName, Instant verifiedAt) {}
