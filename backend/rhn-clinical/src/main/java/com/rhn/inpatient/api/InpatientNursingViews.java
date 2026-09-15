package com.rhn.inpatient.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class InpatientNursingViews {
    private InpatientNursingViews() {
    }

    public record NursingContent(
            String focus, String observation, String intervention,
            String response, String education, String note) {
    }

    public record ObservationSummary(
            BigDecimal temperatureCelsius,
            BigDecimal pulseRate,
            BigDecimal respiratoryRate,
            BigDecimal systolicBloodPressure,
            BigDecimal diastolicBloodPressure,
            BigDecimal oxygenSaturation,
            BigDecimal intakeVolumeMl,
            BigDecimal outputVolumeMl,
            Integer painScore,
            String consciousnessCode,
            List<String> riskFlags) {
        public ObservationSummary {
            riskFlags = riskFlags == null ? List.of() : List.copyOf(riskFlags);
        }
    }

    public record NursingAssessment(
            String assessmentType,
            String admissionMethod,
            String communicationStatus,
            String selfCareLevel,
            String mobilityLevel,
            String skinStatus,
            String nutritionStatus,
            String fallRiskLevel,
            String pressureInjuryRiskLevel,
            Integer painScore,
            List<String> riskFlags,
            String conclusion,
            List<String> immediateActions) {
        public NursingAssessment {
            riskFlags = riskFlags == null ? List.of() : List.copyOf(riskFlags);
            immediateActions = immediateActions == null ? List.of() : List.copyOf(immediateActions);
        }
    }

    public record NursingRecordView(
            Long id, Long episodeId, Long encounterId, Long residentId,
            Long organizationId, Long departmentId,
            Instant occurredAt, String recordType,
            NursingContent content, ObservationSummary observationSummary, NursingAssessment assessment,
            Long recordedBySubjectId, Long recordedByPractitionerId,
            String recorderName, Instant recordedAt,
            String contentDigestAlgorithm, String contentDigest, Long integrityEvidenceId) {
    }

    public record HandoffPatientView(
            Long id, Long episodeId, Long encounterId, Long residentId,
            String residentName, String bedNo, String situation,
            List<String> pendingActions, List<String> riskFlags, int sortOrder) {
        public HandoffPatientView {
            pendingActions = List.copyOf(pendingActions);
            riskFlags = List.copyOf(riskFlags);
        }
    }

    public record HandoffSignatureView(
            Long id, String stage, String signatureMeaning,
            Long signerSubjectId, Long signerPractitionerId, String signerName,
            Instant signedAt, Long signatureEvidenceId) {
    }

    public record ShiftHandoffView(
            Long id, long revision, Long organizationId, Long departmentId,
            Instant from, Instant to, String wardSummary, List<String> generalItems,
            String status, Long createdBySubjectId, Long createdByPractitionerId,
            String creatorName, Instant createdAt, Instant updatedAt,
            String contentDigestAlgorithm, String contentDigest, Long integrityEvidenceId,
            List<HandoffPatientView> patients, List<HandoffSignatureView> signatures) {
        public ShiftHandoffView {
            generalItems = List.copyOf(generalItems);
            patients = List.copyOf(patients);
            signatures = List.copyOf(signatures);
        }
    }
}
