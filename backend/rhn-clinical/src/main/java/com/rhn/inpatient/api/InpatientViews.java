package com.rhn.inpatient.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class InpatientViews {
    private InpatientViews() {
    }

    public record BootstrapView(List<BedView> beds, List<EpisodeView> episodes) {
        public BootstrapView {
            beds = List.copyOf(beds);
            episodes = List.copyOf(episodes);
        }
    }

    public record WardBoardView(
            Instant generatedAt, Instant from, Instant to,
            WardMetricsView metrics, List<WardPatientView> patients) {
        public WardBoardView {
            patients = List.copyOf(patients);
        }
    }

    public record WardMetricsView(
            int patientCount, int specialCareCount, int pendingVerificationCount,
            int pendingTaskCount, int overdueTaskCount, int awaitingReceiptPatientCount,
            int awaitingReceiptBatchCount, int exceptionPatientCount) {
    }

    public record WardPatientView(
            Long episodeId, Long encounterId, Long residentId, String residentName,
            String episodeNo, String bedNo, String wardName, String nursingLevelCode,
            Instant admittedAt, int pendingVerificationCount,
            int pendingTaskCount, int overdueTaskCount,
            int medicationTaskCount, int serviceTaskCount, int nursingTaskCount,
            int pendingDispatchCount, int awaitingReceiptCount, int deliveryDiscrepancyCount,
            String attentionLevel, String handoverSummary) {
    }

    public record BedView(
            Long id, long revision, Long organizationId, Long departmentId, String departmentName,
            Long wardId, String wardName, Long roomId, String roomName,
            String code, String bedNo, String bedType, String genderRestriction,
            String operationalStatus, String displayStatus, String nursingGroupCode,
            BigDecimal dailyBedRate, Long episodeId, Long residentId, String residentName,
            Instant occupiedAt) {
    }

    public record EpisodeView(
            Long id, long revision, String episodeNo, String status,
            Long residentId, String residentName, String healthRecordNo, String gender, LocalDate birthDate,
            Long organizationId, Long departmentId, String departmentName,
            Long encounterId, String encounterNo,
            Long wardId, String wardName, Long roomId, String roomName, Long bedId, String bedNo,
            String admissionTypeCode, String admissionSourceCode, String admissionReason,
            String admissionMethodCode, String conditionCode, String paymentMethodCode,
            String referralOrganizationName, String emergencyContactName,
            @DictionaryBinding("PI_RELATED_PERSON_RELATIONSHIP") String emergencyContactRelationship,
            String emergencyContactPhone, String admissionNote,
            String nursingLevelCode, String dietCode, Long primaryPractitionerId,
            Instant admittedAt, Instant dischargedAt, String dischargeDispositionCode, String dischargeNote) {
    }

    public record DischargeReadinessView(
            Long episodeId, Long encounterId, String episodeStatus, boolean dischargeCompleted,
            boolean ready, Instant checkedAt, int openLongTermOrderCount,
            int incompleteTemporaryOrderCount, int pendingTaskCount,
            List<RequiredDocumentView> requiredDocuments, List<DischargeDiagnosisView> dischargeDiagnoses,
            List<DischargeIssueView> blockers) {
        public DischargeReadinessView {
            requiredDocuments = List.copyOf(requiredDocuments);
            dischargeDiagnoses = List.copyOf(dischargeDiagnoses);
            blockers = List.copyOf(blockers);
        }
    }

    public record RequiredDocumentView(
            String documentType, String title, Long documentId, Integer currentVersion,
            String status, boolean satisfied) {
    }

    public record DischargeDiagnosisView(
            Long id, String diagnosisStage, String code, String display, String diagnosisType,
            String verificationStatus, String diagnosisStatus) {
    }

    public record DischargeDiagnosisListView(
            Long episodeId, Long encounterId, List<DischargeDiagnosisView> diagnoses) {
        public DischargeDiagnosisListView {
            diagnoses = List.copyOf(diagnoses);
        }
    }

    public record AdmissionDiagnosisView(
            Long id, String diagnosisStage, String code, String display, String diagnosisType,
            String verificationStatus, String diagnosisStatus) {
    }

    public record AdmissionDiagnosisListView(
            Long episodeId, Long encounterId, List<AdmissionDiagnosisView> diagnoses) {
        public AdmissionDiagnosisListView {
            diagnoses = List.copyOf(diagnoses);
        }
    }

    public record DischargeIssueView(
            String code, String message, String objectType, int count, List<Long> objectIds) {
        public DischargeIssueView {
            objectIds = List.copyOf(objectIds);
        }
    }
}
