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
@Table(name = "RHN_SUP_STOCK_LOT")
public class StockLot {
    @Id @Column(name = "ID_STOCK_LOT") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_ITEM_PKG", nullable = false) private Long packageId;
    @Column(name = "CD_LOT_NO", nullable = false) private String lotNo;
    @Column(name = "DA_PRODUCTION") private LocalDate productionDate;
    @Column(name = "DA_EXPIRY") private LocalDate expiryDate;
    @Column(name = "CD_APPROVAL_SNAP") private String approvalCodeSnapshot;
    @Column(name = "NA_MFR_SNAP") private String manufacturerNameSnapshot;
    @Column(name = "SD_QUALITY_STATUS", nullable = false) private String qualityStatus;
    @Column(name = "DT_QUALITY", nullable = false) private Instant qualityAt;
    @Column(name = "ID_QUALITY_USER", nullable = false) private Long qualityUserId;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

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
