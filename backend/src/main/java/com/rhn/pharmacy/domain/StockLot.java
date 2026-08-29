package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "stock_lots")
public class StockLot {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "package_id", nullable = false) private Long packageId;
    @Column(name = "lot_no", nullable = false) private String lotNo;
    @Column(name = "production_date") private LocalDate productionDate;
    @Column(name = "expiry_date") private LocalDate expiryDate;
    @Column(name = "approval_code_snapshot") private String approvalCodeSnapshot;
    @Column(name = "manufacturer_name_snapshot") private String manufacturerNameSnapshot;
    @Column(name = "quality_status", nullable = false) private String qualityStatus;
    @Column(name = "quality_at", nullable = false) private Instant qualityAt;
    @Column(name = "quality_user_id", nullable = false) private Long qualityUserId;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    protected StockLot() {}

    public StockLot(Long tenantId, Long catalogItemId, Long packageId, String lotNo,
                    LocalDate productionDate, LocalDate expiryDate, String approvalCodeSnapshot,
                    String manufacturerNameSnapshot, String qualityStatus, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.catalogItemId = catalogItemId;
        this.packageId = packageId; this.lotNo = lotNo; this.productionDate = productionDate;
        this.expiryDate = expiryDate; this.approvalCodeSnapshot = approvalCodeSnapshot;
        this.manufacturerNameSnapshot = manufacturerNameSnapshot; this.qualityStatus = qualityStatus;
        this.qualityAt = Instant.now(); this.qualityUserId = actorId; this.status = "ACTIVE";
        this.createdAt = qualityAt; this.createdBy = actorId;
    }

    public boolean issuable(LocalDate date) {
        return "ACTIVE".equals(status) && "QUALIFIED".equals(qualityStatus)
                && (expiryDate == null || !expiryDate.isBefore(date));
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long catalogItemId() { return catalogItemId; }
    public Long packageId() { return packageId; }
    public String lotNo() { return lotNo; }
    public LocalDate productionDate() { return productionDate; }
    public LocalDate expiryDate() { return expiryDate; }
    public String approvalCodeSnapshot() { return approvalCodeSnapshot; }
    public String manufacturerNameSnapshot() { return manufacturerNameSnapshot; }
    public String qualityStatus() { return qualityStatus; }
    public Instant qualityAt() { return qualityAt; }
    public Long qualityUserId() { return qualityUserId; }
    public String status() { return status; }
    public Instant createdAt() { return createdAt; }
}
