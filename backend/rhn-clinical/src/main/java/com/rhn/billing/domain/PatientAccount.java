package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_BIL_PAT_ACCT")
public class PatientAccount {
    @Id @Column(name = "ID_PAT_ACCT") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "SD_ACCT_TYPE", nullable = false) private String accountType;
    @Column(name = "CD_CCY", nullable = false) private String currencyCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_OPENED", nullable = false) private Instant openedAt;
    @Column(name = "DT_CLOSED") private Instant closedAt;

    protected PatientAccount() {}

    public PatientAccount(Long tenantId, Long residentId, Long encounterId, Long organizationId,
                          Long departmentId, String currencyCode) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId; this.organizationId = organizationId; this.departmentId = departmentId;
        this.accountType = "OUTPATIENT"; this.currencyCode = currencyCode; this.status = "OPEN";
        this.openedAt = Instant.now();
    }

    public static PatientAccount registration(Long tenantId, Long residentId, Long organizationId,
                                              Long departmentId, String currencyCode) {
        PatientAccount value = new PatientAccount();
        value.id = GlobalIds.next(); value.tenantId = tenantId; value.residentId = residentId;
        value.organizationId = organizationId; value.departmentId = departmentId;
        value.accountType = "REGISTRATION"; value.currencyCode = currencyCode;
        value.status = "OPEN"; value.openedAt = Instant.now();
        return value;
    }

    public static PatientAccount inpatient(Long tenantId, Long residentId, Long encounterId,
                                           Long organizationId, Long departmentId, String currencyCode) {
        PatientAccount value = new PatientAccount();
        value.id = GlobalIds.next(); value.tenantId = tenantId; value.residentId = residentId;
        value.encounterId = encounterId; value.organizationId = organizationId; value.departmentId = departmentId;
        value.accountType = "INPATIENT"; value.currencyCode = currencyCode;
        value.status = "OPEN"; value.openedAt = Instant.now();
        return value;
    }

    public void bindEncounter(Long encounterId) {
        if (this.encounterId != null && !this.encounterId.equals(encounterId)) {
            throw new IllegalStateException("费用账户已经绑定其他就诊");
        }
        this.encounterId = encounterId;
        if ("REGISTRATION".equals(accountType)) accountType = "OUTPATIENT";
    }

    public void close(Instant closedAt) {
        if ("CLOSED".equals(status)) return;
        this.status = "CLOSED";
        this.closedAt = closedAt == null ? Instant.now() : closedAt;
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
