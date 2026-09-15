package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Entity
@Table(name = "RHN_SUP_WARD_DELIV")
public class WardDelivery {
    @Id @Column(name = "ID_WARD_DELIV") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_DEPT_NURS_UNIT", nullable = false) private Long nursingUnitDepartmentId;
    @Column(name = "CD_DELIV_NO", nullable = false) private String deliveryNo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "NA_STOCK_SITE_SNAP", nullable = false) private String stockSiteNameSnapshot;
    @Column(name = "NA_NURS_UNIT_SNAP", nullable = false) private String nursingUnitNameSnapshot;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_DISPATCHED") private Instant dispatchedAt;
    @Column(name = "ID_USER_DISPATCHED") private Long dispatchedBy;
    @Column(name = "DES_DISPATCH_NOTE") private String dispatchNote;
    @Column(name = "DT_RECEIVED") private Instant receivedAt;
    @Column(name = "ID_USER_RECEIVED") private Long receivedBy;
    @Column(name = "DES_RCPT_NOTE") private String receiptNote;
    @Column(name = "DES_DISCREPANCY_NOTE") private String discrepancyNote;
    @Column(name = "DT_RESOLVED") private Instant resolvedAt;
    @Column(name = "ID_USER_RESOLVED") private Long resolvedBy;
    @Column(name = "CD_RESOLUTION") private String resolutionCode;
    @Column(name = "DES_RESOLUTION_NOTE") private String resolutionNote;

    protected WardDelivery() {}

    public WardDelivery(Long tenantId, Long organizationId, Long stockSiteId, Long nursingUnitDepartmentId,
                        String deliveryNo, String stockSiteNameSnapshot, String nursingUnitNameSnapshot,
                        Long actorId, Instant now) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.stockSiteId = stockSiteId; this.nursingUnitDepartmentId = nursingUnitDepartmentId;
        this.deliveryNo = deliveryNo; this.status = "PENDING_DISPATCH";
        this.stockSiteNameSnapshot = stockSiteNameSnapshot;
        this.nursingUnitNameSnapshot = nursingUnitNameSnapshot;
        this.createdAt = now; this.createdBy = actorId;
    }

    public String dispatch(long expectedRevision, Long actorId, Instant now, String note) {
        requireRevision(expectedRevision);
        if (!"PENDING_DISPATCH".equals(status)) {
            throw conflict("WARD_DELIVERY_NOT_PENDING", "只有待送出的病区药品可以确认送出");
        }
        String previous = status; status = "IN_TRANSIT"; dispatchedAt = now; dispatchedBy = actorId;
        dispatchNote = note; return previous;
    }

    public String receive(long expectedRevision, Long actorId, Instant now, boolean discrepancy,
                          String note, String discrepancyDescription) {
        requireRevision(expectedRevision);
        if (!"IN_TRANSIT".equals(status)) {
            throw conflict("WARD_DELIVERY_NOT_IN_TRANSIT", "只有配送中的病区药品可以签收");
        }
        String previous = status; status = discrepancy ? "DISCREPANCY" : "RECEIVED";
        receivedAt = now; receivedBy = actorId; receiptNote = note;
        discrepancyNote = discrepancy ? discrepancyDescription : null;
        return previous;
    }

    public String resolve(long expectedRevision, Long actorId, Instant now, String code, String note) {
        requireRevision(expectedRevision);
        if (!"DISCREPANCY".equals(status)) {
            throw conflict("WARD_DELIVERY_NO_DISCREPANCY", "只有存在差异的交接单可以确认处置结果");
        }
        String previous = status; status = "RESOLVED"; resolvedAt = now; resolvedBy = actorId;
        resolutionCode = code; resolutionNote = note; return previous;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) {
            throw conflict("WARD_DELIVERY_REVISION_CONFLICT", "病区交接单已被其他用户更新，请刷新后重试");
        }
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long nursingUnitDepartmentId() { return nursingUnitDepartmentId; }
    public String deliveryNo() { return deliveryNo; }
    public String status() { return status; }
    public String stockSiteNameSnapshot() { return stockSiteNameSnapshot; }
    public String nursingUnitNameSnapshot() { return nursingUnitNameSnapshot; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant dispatchedAt() { return dispatchedAt; }
    public Long dispatchedBy() { return dispatchedBy; }
    public String dispatchNote() { return dispatchNote; }
    public Instant receivedAt() { return receivedAt; }
    public Long receivedBy() { return receivedBy; }
    public String receiptNote() { return receiptNote; }
    public String discrepancyNote() { return discrepancyNote; }
    public Instant resolvedAt() { return resolvedAt; }
    public Long resolvedBy() { return resolvedBy; }
    public String resolutionCode() { return resolutionCode; }
    public String resolutionNote() { return resolutionNote; }
}
