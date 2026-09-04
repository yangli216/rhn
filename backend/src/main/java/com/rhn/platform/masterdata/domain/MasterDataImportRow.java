package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_BD_IMPORT_ROW")
public class MasterDataImportRow {
    @Id @Column(name = "ID_IMPORT_ROW") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_IMPORT_BATCH", nullable = false) private Long batchId;
    @Column(name = "CD_ROW_NUMBER", nullable = false) private int rowNumber;
    @Column(name = "CD_SRC_KEY") private String sourceKey;
    @Lob @Column(name = "JSON_SRC", nullable = false) private String sourceJson;
    @Lob @Column(name = "JSON_NORMALIZED") private String normalizedJson;
    @Lob @Column(name = "JSON_ERRORS", nullable = false) private String errorsJson;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "ID_TARGET") private Long targetId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected MasterDataImportRow() {}

    public MasterDataImportRow(Long tenantId, Long batchId, int rowNumber, String sourceJson, Long actorId) {
        if (rowNumber < 2) throw new IllegalArgumentException("导入数据行号必须从2开始");
        this.id = GlobalIds.next();
        this.tenantId = requireId(tenantId, "租户");
        this.batchId = requireId(batchId, "导入批次");
        this.rowNumber = rowNumber;
        this.sourceJson = requireJson(sourceJson, "原始行");
        this.errorsJson = "[]";
        this.status = "INVALID";
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
        this.updatedBy = requireId(actorId, "操作用户");
    }

    public void validate(String sourceJson, String sourceKey, String normalizedJson,
                         String errorsJson, boolean valid, Long actorId) {
        this.sourceJson = requireJson(sourceJson, "原始行");
        this.sourceKey = optional(sourceKey, 128);
        this.normalizedJson = valid ? requireJson(normalizedJson, "规范化行") : normalizedJson;
        this.errorsJson = requireJson(errorsJson, "错误明细");
        this.status = valid ? "READY" : "INVALID";
        this.targetId = null;
        touch(actorId);
    }

    public void imported(Long targetId, Long actorId) {
        if (!"READY".equals(status) && !"FAILED".equals(status)) {
            throw new IllegalStateException("当前导入行不能提交");
        }
        this.status = "IMPORTED";
        this.targetId = requireId(targetId, "目标基础数据");
        this.errorsJson = "[]";
        touch(actorId);
    }

    public void failed(String errorsJson, Long actorId) {
        if ("IMPORTED".equals(status)) throw new IllegalStateException("已导入行不能标记失败");
        this.status = "FAILED";
        this.targetId = null;
        this.errorsJson = requireJson(errorsJson, "错误明细");
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

    private static String requireJson(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        return value;
    }

    private static String optional(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException("导入来源键长度不能超过" + max);
        return result;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long batchId() { return batchId; }
    public int rowNumber() { return rowNumber; }
    public String sourceKey() { return sourceKey; }
    public String sourceJson() { return sourceJson; }
    public String normalizedJson() { return normalizedJson; }
    public String errorsJson() { return errorsJson; }
    public String status() { return status; }
    public Long targetId() { return targetId; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }
}
