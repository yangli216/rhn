package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

/** 资格名单中的一条记录：一位居民的一项资格类别及有效期。 */
@Entity
@Table(name = "RHN_BIL_RELIEF_ROSTER")
public class ReliefRosterEntry {
    @Id @Column(name = "ID_RELIEF_ROSTER") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "CD_QUALIF_TYPE", nullable = false) private String qualificationType;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "NA_PAT_SNAP", nullable = false) private String residentNameSnapshot;
    @Column(name = "DA_EFF_FROM", nullable = false) private LocalDate effectiveFrom;
    @Column(name = "DA_EFF_TO") private LocalDate effectiveTo;
    @Column(name = "CD_EVID_NO") private String evidenceNo;
    @Column(name = "DES_EVID") private String evidence;
    @Column(name = "CD_BATCH") private String importBatch;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private ReliefRosterStatus status;
    @Column(name = "DES_REASON") private String statusReason;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected ReliefRosterEntry() {}

    public ReliefRosterEntry(Long tenantId, Long organizationId, String qualificationType, Long residentId,
                             String residentName, LocalDate effectiveFrom, LocalDate effectiveTo, String evidenceNo,
                             String evidence, String importBatch, Long actorId, Instant occurredAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.qualificationType = qualificationType; this.residentId = residentId; this.residentNameSnapshot = residentName;
        this.evidenceNo = evidenceNo; this.evidence = evidence; this.importBatch = importBatch;
        this.status = ReliefRosterStatus.ACTIVE;
        this.createdBy = actorId; this.createdAt = occurredAt;
        changeValidity(effectiveFrom, effectiveTo, actorId, occurredAt);
    }

    public void changeValidity(LocalDate from, LocalDate to, Long actorId, Instant occurredAt) {
        if (from == null || (to != null && to.isBefore(from))) throw new IllegalArgumentException("资格有效期不正确");
        this.effectiveFrom = from; this.effectiveTo = to; this.updatedBy = actorId; this.updatedAt = occurredAt;
    }

    public void revise(LocalDate from, LocalDate to, String evidenceNo, String evidence, Long actorId, Instant occurredAt) {
        if (status != ReliefRosterStatus.ACTIVE) throw new IllegalStateException("已停用的资格不能修改");
        this.evidenceNo = evidenceNo; this.evidence = evidence;
        changeValidity(from, to, actorId, occurredAt);
    }

    /** 两段有效期是否重叠；空的失效日期表示长期有效。 */
    public boolean overlaps(LocalDate from, LocalDate to) {
        return (to == null || !to.isBefore(effectiveFrom)) && (effectiveTo == null || !effectiveTo.isBefore(from));
    }

    public void revoke(String reason, Long actorId, Instant occurredAt) {
        if (status != ReliefRosterStatus.ACTIVE) throw new IllegalStateException("资格已停用");
        if (reason == null || reason.isBlank()) throw new IllegalArgumentException("停用资格必须填写原因");
        this.status = ReliefRosterStatus.REVOKED; this.statusReason = reason.trim();
        this.updatedBy = actorId; this.updatedAt = occurredAt;
    }

    public boolean validOn(LocalDate date) {
        return status == ReliefRosterStatus.ACTIVE && !date.isBefore(effectiveFrom)
                && (effectiveTo == null || !date.isAfter(effectiveTo));
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public String qualificationType() { return qualificationType; }
    public Long residentId() { return residentId; }
    public String residentNameSnapshot() { return residentNameSnapshot; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public LocalDate effectiveTo() { return effectiveTo; }
    public String evidenceNo() { return evidenceNo; }
    public String evidence() { return evidence; }
    public String importBatch() { return importBatch; }
    public ReliefRosterStatus status() { return status; }
    public String statusReason() { return statusReason; }
    public Long createdBy() { return createdBy; }
    public Instant createdAt() { return createdAt; }
    public Long updatedBy() { return updatedBy; }
    public Instant updatedAt() { return updatedAt; }
}
