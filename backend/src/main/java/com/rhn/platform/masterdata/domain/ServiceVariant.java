package com.rhn.platform.masterdata.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import com.rhn.shared.id.GlobalIds;
import java.time.Instant;

@Entity
@Table(name = "RHN_BD_SVC_VAR")
public class ServiceVariant {
    @Id @Column(name = "ID_SVC_VAR") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_CONCEPT_BODY_SITE") private Long bodySiteConceptId;
    @Column(name = "CD_SVC_VAR", nullable = false) private String code;
    @Column(name = "NA_SVC_VAR", nullable = false) private String name;
    @Column(name = "SD_METHOD_TYPE") private String methodType;
    @Column(name = "FG_BODY_SITE_REQUIRED", nullable = false) private boolean bodySiteRequired;
    @Column(name = "CD_MUTUAL_RECOGNITION") private String mutualRecognitionCode;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected ServiceVariant() {}

    public ServiceVariant(Long tenantId, Long catalogItemId, Long bodySiteConceptId,
                          String code, String name, String methodType,
                          boolean bodySiteRequired, String mutualRecognitionCode,
                          int sortOrder, String status, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.catalogItemId = catalogItemId;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        updateValues(bodySiteConceptId, code, name, methodType, bodySiteRequired,
                mutualRecognitionCode, sortOrder, status, actorId);
    }

    public void update(long expectedRevision, Long bodySiteConceptId, String code, String name,
                       String methodType, boolean bodySiteRequired, String mutualRecognitionCode,
                       int sortOrder, String status, Long actorId) {
        requireRevision(expectedRevision);
        updateValues(bodySiteConceptId, code, name, methodType, bodySiteRequired,
                mutualRecognitionCode, sortOrder, status, actorId);
    }

    public void changeStatus(long expectedRevision, String status, Long actorId) {
        requireRevision(expectedRevision);
        this.status = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    private void updateValues(Long bodySiteConceptId, String code, String name, String methodType,
                              boolean bodySiteRequired, String mutualRecognitionCode,
                              int sortOrder, String status, Long actorId) {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("检查部位方式编码不能为空");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("检查部位方式名称不能为空");
        // Local body-site variants may be maintained before a standard terminology
        // concept is mapped. The code/name snapshot remains usable operationally.
        if (sortOrder < 0) throw new IllegalArgumentException("排序号不能小于0");
        this.bodySiteConceptId = bodySiteConceptId;
        this.code = code.trim();
        this.name = name.trim();
        this.methodType = methodType;
        this.bodySiteRequired = bodySiteRequired;
        this.mutualRecognitionCode = mutualRecognitionCode;
        this.sortOrder = sortOrder;
        this.status = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long catalogItemId() { return catalogItemId; }
    public Long bodySiteConceptId() { return bodySiteConceptId; }
    public String code() { return code; }
    public String name() { return name; }
    public String methodType() { return methodType; }
    public boolean bodySiteRequired() { return bodySiteRequired; }
    public String mutualRecognitionCode() { return mutualRecognitionCode; }
    public int sortOrder() { return sortOrder; }
    public String status() { return status; }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("检查部位方式已被其他用户修改，请刷新后重试");
    }
}
