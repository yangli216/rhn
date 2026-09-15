package com.rhn.outpatient.encounter;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "RHN_EX_OP_REFER_REQ")
class OutpatientReferralRequest {
    @Id @Column(name = "ID_OP_REFER_REQ") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "CD_REQ_NO", nullable = false) private String requestNo;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_REFER_TYPE", nullable = false) private ReferralType referralType;
    @Column(name = "ID_ORG_TARGET", nullable = false) private Long targetOrganizationId;
    @Column(name = "ID_DEPT_TARGET", nullable = false) private Long targetDepartmentId;
    @Column(name = "ID_PRACT_TARGET") private Long targetPractitionerId;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_URGENCY", nullable = false) private ReferralUrgency urgency;
    @Column(name = "DES_REFER_REASON", nullable = false) private String referralReason;
    @Column(name = "DES_CLIN_SUM", nullable = false) private String clinicalSummary;
    @Column(name = "DT_EXPECTED") private Instant expectedAt;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false) private ReferralStatus status;
    @Column(name = "ID_PAT_REG_TARGET") private Long targetRegistrationId;
    @Column(name = "ID_ENC_TARGET") private Long targetEncounterId;
    @Column(name = "ID_USER_REQUESTED", nullable = false) private Long requestedBy;
    @Column(name = "DT_REQUESTED", nullable = false) private Instant requestedAt;
    @Column(name = "ID_USER_ACCEPTED") private Long acceptedBy;
    @Column(name = "DT_ACCEPTED") private Instant acceptedAt;
    @Column(name = "ID_USER_COMPLETED") private Long completedBy;
    @Column(name = "DT_COMPLETED") private Instant completedAt;
    @Column(name = "DES_OUTCOME") private String outcomeText;
    @Column(name = "DES_REJECTION_REASON") private String rejectionReason;
    @Column(name = "CD_CREATE_COMMAND", nullable = false) private String createCommandCode;

    protected OutpatientReferralRequest() {}

    OutpatientReferralRequest(Long tenantId, Encounter encounter, ReferralType referralType,
                              Long targetOrganizationId, Long targetDepartmentId, Long targetPractitionerId,
                              ReferralUrgency urgency, String referralReason, String clinicalSummary,
                              Instant expectedAt, Long requestedBy, String commandCode) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.encounterId = encounter.id();
        this.residentId = encounter.residentId();
        this.requestNo = "RF" + id;
        this.referralType = referralType;
        this.targetOrganizationId = targetOrganizationId;
        this.targetDepartmentId = targetDepartmentId;
        this.targetPractitionerId = targetPractitionerId;
        this.urgency = urgency;
        this.referralReason = referralReason;
        this.clinicalSummary = clinicalSummary;
        this.expectedAt = expectedAt;
        this.status = ReferralStatus.REQUESTED;
        this.requestedBy = requestedBy;
        this.requestedAt = Instant.now();
        this.createCommandCode = commandCode;
    }

    void accept(Long actorId) {
        requireStatus(ReferralStatus.REQUESTED, "只有待接收的协同请求可以接收");
        status = ReferralStatus.ACCEPTED;
        acceptedBy = actorId;
        acceptedAt = Instant.now();
    }

    void completeConsultation(String opinion, Long actorId) {
        if (referralType != ReferralType.INTERNAL_CONSULT) {
            throw new BusinessException("REFERRAL_TYPE_INVALID", "只有会诊请求可以填写会诊意见", HttpStatus.CONFLICT);
        }
        requireStatus(ReferralStatus.ACCEPTED, "请先接收会诊请求");
        status = ReferralStatus.COMPLETED;
        completedBy = actorId;
        completedAt = Instant.now();
        outcomeText = opinion;
    }

    void completeTransfer(Long registrationId, Long encounterId, Long actorId) {
        if (referralType != ReferralType.DEPARTMENT_TRANSFER) {
            throw new BusinessException("REFERRAL_TYPE_INVALID", "当前请求不是院内转科", HttpStatus.CONFLICT);
        }
        requireStatus(ReferralStatus.ACCEPTED, "请先接收转科请求");
        targetRegistrationId = registrationId;
        targetEncounterId = encounterId;
        status = ReferralStatus.COMPLETED;
        completedBy = actorId;
        completedAt = Instant.now();
        outcomeText = "目标科室已接收并生成连续就诊";
    }

    void reject(String reason, Long actorId) {
        if (status != ReferralStatus.REQUESTED && status != ReferralStatus.ACCEPTED) {
            throw new BusinessException("REFERRAL_STATE_INVALID", "当前协同请求不能拒绝", HttpStatus.CONFLICT);
        }
        status = ReferralStatus.REJECTED;
        completedBy = actorId;
        completedAt = Instant.now();
        rejectionReason = reason;
    }

    void cancel(String reason, Long actorId) {
        if (status != ReferralStatus.REQUESTED && status != ReferralStatus.ACCEPTED) {
            throw new BusinessException("REFERRAL_STATE_INVALID", "当前协同请求不能撤销", HttpStatus.CONFLICT);
        }
        status = ReferralStatus.CANCELLED;
        completedBy = actorId;
        completedAt = Instant.now();
        outcomeText = reason;
    }

    private void requireStatus(ReferralStatus expected, String message) {
        if (status != expected) {
            throw new BusinessException("REFERRAL_STATE_INVALID", message, HttpStatus.CONFLICT);
        }
    }

    Long id() { return id; }
    long revision() { return revision; }
    Long tenantId() { return tenantId; }
    Long encounterId() { return encounterId; }
    Long residentId() { return residentId; }
    String requestNo() { return requestNo; }
    ReferralType referralType() { return referralType; }
    Long targetOrganizationId() { return targetOrganizationId; }
    Long targetDepartmentId() { return targetDepartmentId; }
    Long targetPractitionerId() { return targetPractitionerId; }
    ReferralUrgency urgency() { return urgency; }
    String referralReason() { return referralReason; }
    String clinicalSummary() { return clinicalSummary; }
    Instant expectedAt() { return expectedAt; }
    ReferralStatus status() { return status; }
    Long targetRegistrationId() { return targetRegistrationId; }
    Long targetEncounterId() { return targetEncounterId; }
    Long requestedBy() { return requestedBy; }
    Instant requestedAt() { return requestedAt; }
    Long acceptedBy() { return acceptedBy; }
    Instant acceptedAt() { return acceptedAt; }
    Long completedBy() { return completedBy; }
    Instant completedAt() { return completedAt; }
    String outcomeText() { return outcomeText; }
    String rejectionReason() { return rejectionReason; }
    String createCommandCode() { return createCommandCode; }
}

enum ReferralType {
    INTERNAL_CONSULT,
    DEPARTMENT_TRANSFER
}

enum ReferralUrgency {
    ROUTINE,
    URGENT
}

enum ReferralStatus {
    REQUESTED,
    ACCEPTED,
    COMPLETED,
    REJECTED,
    CANCELLED
}
