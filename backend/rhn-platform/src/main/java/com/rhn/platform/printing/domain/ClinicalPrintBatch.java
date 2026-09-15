package com.rhn.platform.printing.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_SYS_PRINT_BATCH")
public class ClinicalPrintBatch {
    @Id @Column(name = "ID_PRINT_BATCH") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "CD_DOC_TYPE", nullable = false) private String documentType;
    @Column(name = "ID_PRINT_TMPL", nullable = false) private Long templateId;
    @Column(name = "ID_PRINT_TMPL_VER", nullable = false) private Long templateVersionId;
    @Column(name = "ID_PRINT_MEDIA", nullable = false) private Long mediaProfileId;
    @Column(name = "ID_PRINT_DEVICE") private Long deviceId;
    @Column(name = "DA_BUSINESS", nullable = false) private LocalDate businessDate;
    @Lob @Column(name = "JSON_SELECTION", nullable = false) private String selectionJson;
    @Column(name = "SD_LAYOUT_STRATEGY", nullable = false) private String layoutStrategy;
    @Column(name = "SN_START_SLOT", nullable = false) private int startSlot;
    @Column(name = "ID_IDEMPOTENCY", nullable = false) private String idempotencyKey;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "QTY_SELECTED", nullable = false) private int selectedCount;
    @Column(name = "QTY_INCLUDED", nullable = false) private int includedCount;
    @Column(name = "QTY_EXCLUDED", nullable = false) private int excludedCount;
    @Column(name = "QTY_PAGES", nullable = false) private int pageCount;
    @Column(name = "ID_PRINT_OUTPUT") private Long outputId;
    @Column(name = "ID_PRINT_JOB") private Long jobId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ClinicalPrintBatch() {}

    public ClinicalPrintBatch(Long tenantId, Long organizationId, Long departmentId, String documentType,
                              Long templateId, Long templateVersionId, Long mediaProfileId, Long deviceId,
                              LocalDate businessDate, String selectionJson, String layoutStrategy, int startSlot,
                              String idempotencyKey, int selectedCount, Long actorId) {
        Instant now = Instant.now();
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.documentType = documentType; this.templateId = templateId;
        this.templateVersionId = templateVersionId; this.mediaProfileId = mediaProfileId; this.deviceId = deviceId;
        this.businessDate = businessDate; this.selectionJson = selectionJson; this.layoutStrategy = layoutStrategy;
        this.startSlot = startSlot; this.idempotencyKey = idempotencyKey; this.status = "BUILDING";
        this.selectedCount = selectedCount; this.createdAt = now; this.createdBy = actorId;
        this.updatedAt = now; this.updatedBy = actorId;
    }

    public void generated(Long outputId, Long jobId, int includedCount, int excludedCount, int pageCount, Long actorId) {
        this.outputId = outputId; this.jobId = jobId; this.includedCount = includedCount;
        this.excludedCount = excludedCount; this.pageCount = pageCount;
        this.status = excludedCount > 0 ? "PARTIAL" : "GENERATED"; touch(actorId);
    }

    public void queued(Long actorId) { requireDispatchable(); this.status = "QUEUED"; touch(actorId); }
    public void sent(Long actorId) { requireDispatchable(); this.status = "SENT"; touch(actorId); }
    public void confirmed(Long actorId) { this.status = "DEVICE_CONFIRMED"; touch(actorId); }
    public void failed(Long actorId) { this.status = "FAILED"; touch(actorId); }

    private void requireDispatchable() {
        if (!("GENERATED".equals(status) || "PARTIAL".equals(status) || "QUEUED".equals(status)
                || "FAILED".equals(status))) {
            throw new BusinessException("PRINT_BATCH_STATE_INVALID", "当前打印批次不能再次投递", HttpStatus.CONFLICT);
        }
    }
    private void touch(Long actorId) { this.updatedAt = Instant.now(); this.updatedBy = actorId; }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String documentType() { return documentType; }
    public Long templateId() { return templateId; }
    public Long templateVersionId() { return templateVersionId; }
    public Long mediaProfileId() { return mediaProfileId; }
    public Long deviceId() { return deviceId; }
    public LocalDate businessDate() { return businessDate; }
    public String selectionJson() { return selectionJson; }
    public String layoutStrategy() { return layoutStrategy; }
    public int startSlot() { return startSlot; }
    public String idempotencyKey() { return idempotencyKey; }
    public String status() { return status; }
    public int selectedCount() { return selectedCount; }
    public int includedCount() { return includedCount; }
    public int excludedCount() { return excludedCount; }
    public int pageCount() { return pageCount; }
    public Long outputId() { return outputId; }
    public Long jobId() { return jobId; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
}
