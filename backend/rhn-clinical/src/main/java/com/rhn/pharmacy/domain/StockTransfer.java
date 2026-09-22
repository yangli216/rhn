package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_STOCK_XFER")
public class StockTransfer {
    @Id @Column(name = "ID_STOCK_XFER") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT_SRC", nullable = false) private Long sourceDepartmentId;
    @Column(name = "ID_DEPT_DEST", nullable = false) private Long destinationDepartmentId;
    @Column(name = "ID_STOCK_SITE_SRC", nullable = false) private Long sourceSiteId;
    @Column(name = "ID_STOCK_SITE_DEST", nullable = false) private Long destinationSiteId;
    @Column(name = "CD_XFER_NO", nullable = false) private String transferNo;
    @Column(name = "CD_REQ", nullable = false) private String requestCode;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_REQD", nullable = false) private Instant requestedAt;
    @Column(name = "ID_USER_REQD", nullable = false) private Long requestedBy;
    @Column(name = "DT_APRVD") private Instant approvedAt;
    @Column(name = "ID_USER_APRVD") private Long approvedBy;
    @Column(name = "DT_DSPTD") private Instant dispatchedAt;
    @Column(name = "ID_USER_DSPTD") private Long dispatchedBy;
    @Column(name = "DT_RECVD") private Instant receivedAt;
    @Column(name = "ID_USER_RECVD") private Long receivedBy;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "DES_STOCK_XFER") private String description;
    @Column(name = "ID_INV_TXN_OUTBND") private Long outboundTransactionId;
    @Column(name = "ID_INV_TXN_INBOUND") private Long inboundTransactionId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected StockTransfer() {}
    public StockTransfer(Long tenantId, Long organizationId, Long sourceDepartmentId, Long destinationDepartmentId,
                         Long sourceSiteId, Long destinationSiteId,
                         String transferNo, String requestCode, Instant requestedAt, String reason,
                         String description, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.sourceDepartmentId = sourceDepartmentId;
        this.destinationDepartmentId = destinationDepartmentId;
        this.sourceSiteId = sourceSiteId; this.destinationSiteId = destinationSiteId; this.transferNo = transferNo;
        this.requestCode = requestCode; this.status = "DRAFT"; this.requestedAt = requestedAt;
        this.requestedBy = actorId; this.reason = reason; this.description = description;
        this.createdAt = Instant.now(); this.updatedAt = createdAt; this.updatedBy = actorId;
    }
    public void submit(Long actor) { require("DRAFT"); status = "SUBMITTED"; touch(actor); }
    public void approve(Long actor, String reason) { require("SUBMITTED"); status = "APPROVED"; approvedAt = Instant.now(); approvedBy = actor; if(reason!=null&&!reason.isBlank())this.reason = reason; touch(actor); }
    public void reject(Long actor, String reason) { require("SUBMITTED"); status = "REJECTED"; approvedAt = Instant.now(); approvedBy = actor; this.reason = reason; touch(actor); }
    public void markPicking(Long actor) { require("APPROVED"); status = "PICKING"; touch(actor); }
    public void dispatch(Long actor, Long transactionId) { require("PICKING"); status = "IN_TRANSIT"; dispatchedAt = Instant.now(); dispatchedBy = actor; outboundTransactionId = transactionId; touch(actor); }
    public void complete(Long actor, Long transactionId) { require("IN_TRANSIT"); status = "COMPLETED"; receivedAt = Instant.now(); receivedBy = actor; inboundTransactionId = transactionId; touch(actor); }
    private void require(String expected) { if (!expected.equals(status)) throw new IllegalStateException("调拨单状态不允许当前操作"); }
    private void touch(Long actor) { updatedAt = Instant.now(); updatedBy = actor; }
    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long sourceDepartmentId() { return sourceDepartmentId; } public Long destinationDepartmentId() { return destinationDepartmentId; }
    public Long sourceSiteId() { return sourceSiteId; }
    public Long destinationSiteId() { return destinationSiteId; } public String transferNo() { return transferNo; }
    public String requestCode() { return requestCode; } public String status() { return status; }
    public Instant requestedAt() { return requestedAt; } public Long requestedBy() { return requestedBy; }
    public Instant approvedAt() { return approvedAt; } public Long approvedBy() { return approvedBy; }
    public Instant dispatchedAt() { return dispatchedAt; } public Long dispatchedBy() { return dispatchedBy; }
    public Instant receivedAt() { return receivedAt; } public Long receivedBy() { return receivedBy; }
    public String reason() { return reason; } public String description() { return description; }
    public Long outboundTransactionId() { return outboundTransactionId; } public Long inboundTransactionId() { return inboundTransactionId; }
}
