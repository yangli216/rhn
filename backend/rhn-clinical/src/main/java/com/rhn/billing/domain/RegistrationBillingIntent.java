package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_REG_BIL_INTENT")
public class RegistrationBillingIntent {
    @Id @Column(name = "ID_REG_BIL_INTENT") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_APPT") private Long appointmentId;
    @Column(name = "ID_SVC_SCHED") private Long scheduleId;
    @Column(name = "ID_CATALOG_ITEM") private Long catalogItemId;
    @Column(name = "ID_SCHED_SLOT_HOLD") private Long slotHoldId;
    @Column(name = "ID_PAT_ACCT") private Long patientAccountId;
    @Column(name = "ID_STL") private Long settlementId;
    @Column(name = "ID_PAY_ORDER") private Long paymentOrderId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "CD_IDEMP", nullable = false) private String idempotencyCode;
    @Column(name = "SD_REG_SRC", nullable = false) private String registrationSource;
    @Column(name = "SD_VISIT_TYPE", nullable = false) private String visitType;
    @Column(name = "SD_STL_MODE", nullable = false) private String settlementMode;
    @Column(name = "ID_PAT_COVER") private Long coverageId;
    @Column(name = "CD_COVER_TYPE_SNAP") private String coverageTypeCodeSnapshot;
    @Column(name = "NA_COVER_PAYER_SNAP") private String coveragePayerNameSnapshot;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "AMT_FEE", nullable = false, precision = 24, scale = 6) private BigDecimal feeAmount;
    @Column(name = "CD_CCY", nullable = false) private String currencyCode;
    @Column(name = "CD_ITEM_SNAP") private String itemCodeSnapshot;
    @Column(name = "NA_ITEM_SNAP") private String itemNameSnapshot;
    @Column(name = "DT_EXPIRES") private Instant expiresAt;
    @Column(name = "QTY_COMP_ATMPTS", nullable = false) private int completionAttempts;
    @Column(name = "CD_LAST_ERROR") private String lastErrorCode;
    @Column(name = "DES_LAST_ERROR_MSG") private String lastErrorMessage;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "DT_CMPLD") private Instant completedAt;

    protected RegistrationBillingIntent() {}

    public RegistrationBillingIntent(Long tenantId, Long residentId, Long organizationId, Long departmentId,
                                     Long appointmentId, Long scheduleId, Long catalogItemId, Long slotHoldId, String idempotencyCode,
                                     String registrationSource, String visitType, String settlementMode, Long coverageId,
                                     String coverageTypeCode, String coveragePayerName,
                                     BigDecimal feeAmount,
                                     String currencyCode, String itemCode, String itemName, Instant expiresAt,
                                     Long createdBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.organizationId = organizationId; this.departmentId = departmentId; this.appointmentId = appointmentId;
        this.scheduleId = scheduleId;
        this.catalogItemId = catalogItemId; this.slotHoldId = slotHoldId; this.idempotencyCode = idempotencyCode;
        this.registrationSource = registrationSource; this.visitType = visitType;
        this.settlementMode = settlementMode; this.coverageId = coverageId;
        this.coverageTypeCodeSnapshot = coverageTypeCode; this.coveragePayerNameSnapshot = coveragePayerName;
        this.status = "PAYMENT_PENDING";
        this.feeAmount = feeAmount; this.currencyCode = currencyCode; this.itemCodeSnapshot = itemCode;
        this.itemNameSnapshot = itemName; this.expiresAt = expiresAt; this.createdBy = createdBy;
        this.createdAt = Instant.now(); this.updatedAt = createdAt;
    }

    public void attachFinancials(Long accountId, Long settlementId) {
        this.patientAccountId = accountId; this.settlementId = settlementId; this.updatedAt = Instant.now();
    }

    public void linkPaymentOrder(Long orderId) {
        if (paymentOrderId != null && !paymentOrderId.equals(orderId)) {
            throw com.rhn.shared.api.BusinessErrors.conflict("REGISTRATION_PAYMENT_ORDER_MISMATCH",
                    "挂号意向已绑定其他支付指令");
        }
        this.paymentOrderId = orderId; this.updatedAt = Instant.now();
    }

    public boolean beginCompletion(Long orderId) {
        if ("COMPLETED".equals(status)) return false;
        if (!("PAYMENT_PENDING".equals(status) || "PAID".equals(status)
                || "COMPLETION_FAILED".equals(status) || "COMPLETING".equals(status))) return false;
        if (feeAmount.signum() > 0 && orderId == null) return false;
        if (paymentOrderId != null && orderId != null && !paymentOrderId.equals(orderId)) return false;
        if (orderId != null) paymentOrderId = orderId;
        status = "COMPLETING"; completionAttempts++; lastErrorCode = null; lastErrorMessage = null;
        updatedAt = Instant.now(); return true;
    }

    public void completed(Long encounterId) {
        this.encounterId = encounterId; this.status = "COMPLETED";
        this.completedAt = Instant.now(); this.updatedAt = completedAt;
        this.lastErrorCode = null; this.lastErrorMessage = null;
    }

    public void failed(String code, String message) {
        if ("COMPLETED".equals(status)) return;
        this.status = "COMPLETION_FAILED"; this.lastErrorCode = code;
        this.lastErrorMessage = message == null ? "挂号业务落地失败" : message;
        this.updatedAt = Instant.now();
    }

    public void cancel() {
        if (!"PAYMENT_PENDING".equals(status) || paymentOrderId != null) {
            throw com.rhn.shared.api.BusinessErrors.conflict("REGISTRATION_INTENT_NOT_CANCELLABLE",
                    "已发起支付或已完成的挂号意向不能直接取消");
        }
        this.status = "CANCELLED"; this.updatedAt = Instant.now();
    }

    public void beginCancellation() {
        if ("CANCELLED".equals(status) || "CANCELLATION_PENDING".equals(status)) return;
        if (!("COMPLETED".equals(status) || "CANCELLATION_FAILED".equals(status))) {
            throw com.rhn.shared.api.BusinessErrors.conflict("REGISTRATION_INTENT_NOT_WITHDRAWABLE",
                    "当前挂号收费状态不能办理退号");
        }
        this.status = "CANCELLATION_PENDING";
        this.lastErrorCode = null;
        this.lastErrorMessage = null;
        this.updatedAt = Instant.now();
    }

    public void cancellationFailed(String code, String message) {
        if ("CANCELLED".equals(status)) return;
        this.status = "CANCELLATION_FAILED";
        this.lastErrorCode = code;
        this.lastErrorMessage = message;
        this.updatedAt = Instant.now();
    }

    public void cancelledAfterCompletion() {
        this.status = "CANCELLED";
        this.lastErrorCode = null;
        this.lastErrorMessage = null;
        this.updatedAt = Instant.now();
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long appointmentId() { return appointmentId; }
    public Long scheduleId() { return scheduleId; }
    public Long catalogItemId() { return catalogItemId; }
    public Long slotHoldId() { return slotHoldId; }
    public Long patientAccountId() { return patientAccountId; }
    public Long settlementId() { return settlementId; }
    public Long paymentOrderId() { return paymentOrderId; }
    public Long encounterId() { return encounterId; }
    public String idempotencyCode() { return idempotencyCode; }
    public String registrationSource() { return registrationSource; }
    public String visitType() { return visitType; }
    public String settlementMode() { return settlementMode; }
    public Long coverageId() { return coverageId; }
    public String coverageTypeCode() { return coverageTypeCodeSnapshot; }
    public String coveragePayerName() { return coveragePayerNameSnapshot; }
    public String status() { return status; }
    public BigDecimal feeAmount() { return feeAmount; }
    public String currencyCode() { return currencyCode; }
    public String itemCode() { return itemCodeSnapshot; }
    public String itemName() { return itemNameSnapshot; }
    public Instant expiresAt() { return expiresAt; }
    public int completionAttempts() { return completionAttempts; }
    public String lastErrorCode() { return lastErrorCode; }
    public String lastErrorMessage() { return lastErrorMessage; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }
    public Instant completedAt() { return completedAt; }
}
