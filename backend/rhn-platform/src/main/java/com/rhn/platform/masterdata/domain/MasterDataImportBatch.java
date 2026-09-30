package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_BD_IMPORT_BATCH")
public class MasterDataImportBatch {
    @Id @Column(name = "ID_IMPORT_BATCH") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "SD_IMPORT_TYPE", nullable = false) private String importType;
    @Column(name = "NA_FILE", nullable = false) private String fileName;
    @Column(name = "HASH_FILE", nullable = false) private String fileHash;
    @Column(name = "CD_REQ", nullable = false) private String requestCode;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private MasterDataImportBatchStatus status;
    @Column(name = "QTY_TOTAL_ROW", nullable = false) private int totalRows;
    @Column(name = "QTY_READY_ROW", nullable = false) private int readyRows;
    @Column(name = "QTY_INVALID_ROW", nullable = false) private int invalidRows;
    @Column(name = "QTY_IMPRTD_ROW", nullable = false) private int importedRows;
    @Column(name = "QTY_FAILED_ROW", nullable = false) private int failedRows;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected MasterDataImportBatch() {}

    public MasterDataImportBatch(Long tenantId, Long actorId, String importType, String fileName,
                                 String fileHash, String requestCode) {
        this.id = GlobalIds.next();
        this.tenantId = Strings.requireId(tenantId, "租户");
        this.createdBy = Strings.requireId(actorId, "操作用户");
        this.importType = Strings.requireText(importType, "导入类型", 32);
        if (!"SERVICE".equals(importType) && !"MEDICATION".equals(importType)) {
            throw new IllegalArgumentException("不支持的基础数据导入类型");
        }
        this.fileName = Strings.requireText(fileName, "文件名", 300);
        this.fileHash = Strings.requireText(fileHash, "文件摘要", 64);
        this.requestCode = Strings.requireText(requestCode, "请求编码", 128);
        this.status = MasterDataImportBatchStatus.PREFLIGHTING;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void refreshCounts(int total, int ready, int invalid, int imported, int failed, Long actorId) {
        if (total < 0 || ready < 0 || invalid < 0 || imported < 0 || failed < 0
                || ready + invalid + imported + failed != total) {
            throw new IllegalArgumentException("导入批次数量不一致");
        }
        totalRows = total;
        readyRows = ready;
        invalidRows = invalid;
        importedRows = imported;
        failedRows = failed;
        if (total == 0 || invalid > 0) status = MasterDataImportBatchStatus.INVALID;
        else if (imported == total) status = MasterDataImportBatchStatus.COMPLETED;
        else if (imported > 0 || failed > 0) status = MasterDataImportBatchStatus.PARTIAL;
        else status = MasterDataImportBatchStatus.READY;
        touch(actorId);
    }

    public void startImport(Long actorId) {
        if (status != MasterDataImportBatchStatus.READY && status != MasterDataImportBatchStatus.PARTIAL) {
            throw new IllegalStateException("只有预检通过或部分失败的批次可以提交");
        }
        status = MasterDataImportBatchStatus.IMPORTING;
        touch(actorId);
    }

    public void cancel(Long actorId) {
        if (status == MasterDataImportBatchStatus.COMPLETED) throw new IllegalStateException("已完成批次不能取消");
        status = MasterDataImportBatchStatus.CANCELLED;
        touch(actorId);
    }

    private void touch(Long actorId) {
        updatedAt = Instant.now();
        updatedBy = Strings.requireId(actorId, "操作用户");
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public String importType() { return importType; }
    public String fileName() { return fileName; }
    public String fileHash() { return fileHash; }
    public String requestCode() { return requestCode; }
    public MasterDataImportBatchStatus status() { return status; }
    public int totalRows() { return totalRows; }
    public int readyRows() { return readyRows; }
    public int invalidRows() { return invalidRows; }
    public int importedRows() { return importedRows; }
    public int failedRows() { return failedRows; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
