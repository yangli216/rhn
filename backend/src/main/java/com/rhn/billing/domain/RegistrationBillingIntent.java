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
@Table(name = "registration_billing_intents")
public class RegistrationBillingIntent {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "schedule_id") private Long scheduleId;
    @Column(name = "catalog_item_id") private Long catalogItemId;
    @Column(name = "slot_hold_id") private Long slotHoldId;
    @Column(name = "patient_account_id") private Long patientAccountId;
    @Column(name = "settlement_id") private Long settlementId;
    @Column(name = "payment_order_id") private Long paymentOrderId;
    @Column(name = "encounter_id") private Long encounterId;
    @Column(name = "idempotency_code", nullable = false) private String idempotencyCode;
    @Column(name = "registration_source", nullable = false) private String registrationSource;
    @Column(name = "visit_type", nullable = false) private String visitType;
    @Column(nullable = false) private String status;
    @Column(name = "fee_amount", nullable = false, precision = 24, scale = 6) private BigDecimal feeAmount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(name = "item_code_snapshot") private String itemCodeSnapshot;
    @Column(name = "item_name_snapshot") private String itemNameSnapshot;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "completion_attempts", nullable = false) private int completionAttempts;
    @Column(name = "last_error_code") private String lastErrorCode;
    @Column(name = "last_error_message") private String lastErrorMessage;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "completed_at") private Instant completedAt;

    protected RegistrationBillingIntent() {}

    public RegistrationBillingIntent(Long tenantId, Long residentId, Long organizationId, Long departmentId,
                                     Long scheduleId, Long catalogItemId, Long slotHoldId, String idempotencyCode,
                                     String registrationSource, String visitType, BigDecimal feeAmount,
                                     String currencyCode, String itemCode, String itemName, Instant expiresAt,
                                     Long createdBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.organizationId = organizationId; this.departmentId = departmentId; this.scheduleId = scheduleId;
        this.catalogItemId = catalogItemId; this.slotHoldId = slotHoldId; this.idempotencyCode = idempotencyCode;
        this.registrationSource = registrationSource; this.visitType = visitType; this.status = "PAYMENT_PENDING";
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

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
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
