package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_BD_CATALOG_CHG_BATCH")
public class CatalogChangeBatch {
    @Id @Column(name = "ID_CATALOG_CHG_BATCH") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "SD_BATCH_TYPE", nullable = false) private String batchType;
    @Column(name = "SD_OPERATION_TYPE", nullable = false) private String operationType;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "CD_REQ", nullable = false) private String requestCode;
    @Column(name = "HASH_REQ", nullable = false) private String requestHash;
    @Column(name = "DA_BUSINESS", nullable = false) private LocalDate businessDate;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "QTY_TOTAL_ROW", nullable = false) private int totalRows;
    @Column(name = "QTY_SUCCEEDED_ROW", nullable = false) private int succeededRows;
    @Column(name = "QTY_FAILED_ROW", nullable = false) private int failedRows;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected CatalogChangeBatch() {}

    public CatalogChangeBatch(Long tenantId, Long actorId, String batchType, String operationType,
                              Long organizationId, String requestCode, String requestHash,
                              LocalDate businessDate, int totalRows) {
        if (totalRows <= 0) throw new IllegalArgumentException("批量操作至少包含一条数据");
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.batchType = batchType;
        this.operationType = operationType; this.organizationId = organizationId;
        this.requestCode = requireText(requestCode, "请求编码", 128); this.businessDate = businessDate;
        this.requestHash = requireText(requestHash, "请求摘要", 64);
        this.status = "PROCESSING"; this.totalRows = totalRows;
        this.createdAt = Instant.now(); this.createdBy = actorId; this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public void complete(int succeeded, int failed, Long actorId) {
        if (succeeded < 0 || failed < 0 || succeeded + failed != totalRows) {
            throw new IllegalArgumentException("批量操作数量不一致");
        }
        succeededRows = succeeded; failedRows = failed;
        status = failed == 0 ? "COMPLETED" : succeeded == 0 ? "FAILED" : "PARTIAL";
        updatedAt = Instant.now(); updatedBy = actorId;
    }

    private static String requireText(String value, String label, int max) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException(label + "长度不能超过" + max);
        return result;
    }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public String batchType() { return batchType; } public String operationType() { return operationType; }
    public Long organizationId() { return organizationId; } public String requestCode() { return requestCode; }
    public String requestHash() { return requestHash; }
    public LocalDate businessDate() { return businessDate; } public String status() { return status; }
    public int totalRows() { return totalRows; } public int succeededRows() { return succeededRows; }
    public int failedRows() { return failedRows; } public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; } public Instant updatedAt() { return updatedAt; }
}
