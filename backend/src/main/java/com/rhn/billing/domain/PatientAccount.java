package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "patient_accounts")
public class PatientAccount {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "account_type", nullable = false) private String accountType;
    @Column(name = "currency_code", nullable = false) private String currencyCode;
    @Column(nullable = false) private String status;
    @Column(name = "opened_at", nullable = false) private Instant openedAt;
    @Column(name = "closed_at") private Instant closedAt;

    protected PatientAccount() {}

    public PatientAccount(Long tenantId, Long residentId, Long encounterId, Long organizationId,
                          Long departmentId, String currencyCode) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId; this.organizationId = organizationId; this.departmentId = departmentId;
        this.accountType = "OUTPATIENT"; this.currencyCode = currencyCode; this.status = "OPEN";
        this.openedAt = Instant.now();
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String accountType() { return accountType; }
    public String currencyCode() { return currencyCode; }
    public String status() { return status; }
    public Instant openedAt() { return openedAt; }
    public Instant closedAt() { return closedAt; }
}
