package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "master_data_import_batches")
public class MasterDataImportBatch {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "import_type", nullable = false) private String importType;
    @Column(name = "file_name", nullable = false) private String fileName;
    @Column(name = "file_hash", nullable = false) private String fileHash;
    @Column(name = "request_code", nullable = false) private String requestCode;
    @Column(nullable = false) private String status;
    @Column(name = "total_rows", nullable = false) private int totalRows;
    @Column(name = "ready_rows", nullable = false) private int readyRows;
    @Column(name = "invalid_rows", nullable = false) private int invalidRows;
    @Column(name = "imported_rows", nullable = false) private int importedRows;
    @Column(name = "failed_rows", nullable = false) private int failedRows;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected MasterDataImportBatch() {}

    public MasterDataImportBatch(Long tenantId, Long actorId, String importType, String fileName,
                                 String fileHash, String requestCode) {
        this.id = GlobalIds.next();
        this.tenantId = requireId(tenantId, "租户");
        this.createdBy = requireId(actorId, "操作用户");
        this.importType = requireCode(importType, "导入类型", 32);
        if (!"SERVICE".equals(importType) && !"MEDICATION".equals(importType)) {
            throw new IllegalArgumentException("不支持的基础数据导入类型");
        }
        this.fileName = requireCode(fileName, "文件名", 300);
        this.fileHash = requireCode(fileHash, "文件摘要", 64);
        this.requestCode = requireCode(requestCode, "请求编码", 128);
        this.status = "PREFLIGHTING";
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
        if (total == 0 || invalid > 0) status = "INVALID";
        else if (imported == total) status = "COMPLETED";
        else if (imported > 0 || failed > 0) status = "PARTIAL";
        else status = "READY";
        touch(actorId);
    }

    public void startImport(Long actorId) {
        if (!"READY".equals(status) && !"PARTIAL".equals(status)) {
            throw new IllegalStateException("只有预检通过或部分失败的批次可以提交");
        }
        status = "IMPORTING";
        touch(actorId);
    }

    public void cancel(Long actorId) {
        if ("COMPLETED".equals(status)) throw new IllegalStateException("已完成批次不能取消");
        status = "CANCELLED";
        touch(actorId);
    }

    private void touch(Long actorId) {
        updatedAt = Instant.now();
        updatedBy = requireId(actorId, "操作用户");
    }

    private static Long requireId(Long value, String label) {
        if (value == null || value <= 0) throw new IllegalArgumentException(label + "标识不能为空");
        return value;
    }

    private static String requireCode(String value, String label, int max) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException(label + "长度不能超过" + max);
        return result;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public String importType() { return importType; }
    public String fileName() { return fileName; }
    public String fileHash() { return fileHash; }
    public String requestCode() { return requestCode; }
    public String status() { return status; }
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
