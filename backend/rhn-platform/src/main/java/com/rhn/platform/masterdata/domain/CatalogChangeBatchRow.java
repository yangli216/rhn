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
@Table(name = "RHN_BD_CATALOG_CHG_ROW")
public class CatalogChangeBatchRow {
    @Id @Column(name = "ID_CATALOG_CHG_ROW") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_CHG_BATCH", nullable = false) private Long batchId;
    @Column(name = "CD_ROW_NUMBER", nullable = false) private int rowNumber;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_PKG") private Long packageId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_SRC", nullable = false) private String sourceJson;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "SD_TARGET_RSRC_TYPE") private String targetResourceType;
    @Column(name = "ID_TARGET") private Long targetId;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

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
