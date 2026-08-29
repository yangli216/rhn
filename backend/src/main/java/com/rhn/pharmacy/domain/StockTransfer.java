package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "stock_transfers")
public class StockTransfer {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "source_site_id", nullable = false) private Long sourceSiteId;
    @Column(name = "destination_site_id", nullable = false) private Long destinationSiteId;
    @Column(name = "transfer_no", nullable = false) private String transferNo;
    @Column(name = "request_code", nullable = false) private String requestCode;
    @Column(nullable = false) private String status;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;
    @Column(name = "requested_by", nullable = false) private Long requestedBy;
    @Column(name = "approved_at") private Instant approvedAt;
    @Column(name = "approved_by") private Long approvedBy;
    @Column(name = "dispatched_at") private Instant dispatchedAt;
    @Column(name = "dispatched_by") private Long dispatchedBy;
    @Column(name = "received_at") private Instant receivedAt;
    @Column(name = "received_by") private Long receivedBy;
    @Column private String reason;
    @Column private String description;
    @Column(name = "outbound_transaction_id") private Long outboundTransactionId;
    @Column(name = "inbound_transaction_id") private Long inboundTransactionId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected StockTransfer() {}
    public StockTransfer(Long tenantId, Long organizationId, Long sourceSiteId, Long destinationSiteId,
                         String transferNo, String requestCode, Instant requestedAt, String reason,
                         String description, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
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
    public Long organizationId() { return organizationId; } public Long sourceSiteId() { return sourceSiteId; }
    public Long destinationSiteId() { return destinationSiteId; } public String transferNo() { return transferNo; }
    public String requestCode() { return requestCode; } public String status() { return status; }
    public Instant requestedAt() { return requestedAt; } public Long requestedBy() { return requestedBy; }
    public Instant approvedAt() { return approvedAt; } public Long approvedBy() { return approvedBy; }
    public Instant dispatchedAt() { return dispatchedAt; } public Long dispatchedBy() { return dispatchedBy; }
    public Instant receivedAt() { return receivedAt; } public Long receivedBy() { return receivedBy; }
    public String reason() { return reason; } public String description() { return description; }
    public Long outboundTransactionId() { return outboundTransactionId; } public Long inboundTransactionId() { return inboundTransactionId; }
}
