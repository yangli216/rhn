package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "catalog_change_batch_rows")
public class CatalogChangeBatchRow {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "batch_id", nullable = false) private Long batchId;
    @Column(name = "row_number", nullable = false) private int rowNumber;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "package_id") private Long packageId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "source_json", nullable = false) private String sourceJson;
    @Column(nullable = false) private String status;
    @Column(name = "target_resource_type") private String targetResourceType;
    @Column(name = "target_id") private Long targetId;
    @Column(name = "error_code") private String errorCode;
    @Column(name = "error_message") private String errorMessage;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected CatalogChangeBatchRow() {}

    public static CatalogChangeBatchRow succeeded(Long tenantId, Long batchId, int rowNumber, Long catalogItemId,
                                                   Long packageId, String sourceJson, String resourceType,
                                                   Long targetId, Long actorId) {
        return new CatalogChangeBatchRow(tenantId, batchId, rowNumber, catalogItemId, packageId, sourceJson,
                "SUCCEEDED", resourceType, targetId, null, null, actorId);
    }

    public static CatalogChangeBatchRow failed(Long tenantId, Long batchId, int rowNumber, Long catalogItemId,
                                                Long packageId, String sourceJson, String errorCode,
                                                String errorMessage, Long actorId) {
        return new CatalogChangeBatchRow(tenantId, batchId, rowNumber, catalogItemId, packageId, sourceJson,
                "FAILED", null, null, errorCode, errorMessage, actorId);
    }

    private CatalogChangeBatchRow(Long tenantId, Long batchId, int rowNumber, Long catalogItemId, Long packageId,
                                  String sourceJson, String status, String targetResourceType, Long targetId,
                                  String errorCode, String errorMessage, Long actorId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.batchId = batchId; this.rowNumber = rowNumber;
        this.catalogItemId = catalogItemId; this.packageId = packageId; this.sourceJson = sourceJson;
        this.status = status; this.targetResourceType = targetResourceType; this.targetId = targetId;
        this.errorCode = errorCode; this.errorMessage = errorMessage;
        this.createdAt = Instant.now(); this.updatedAt = createdAt; this.updatedBy = actorId;
    }

    public Long id() { return id; } public Long batchId() { return batchId; } public int rowNumber() { return rowNumber; }
    public Long catalogItemId() { return catalogItemId; } public Long packageId() { return packageId; }
    public String status() { return status; } public String targetResourceType() { return targetResourceType; }
    public Long targetId() { return targetId; } public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }
}
