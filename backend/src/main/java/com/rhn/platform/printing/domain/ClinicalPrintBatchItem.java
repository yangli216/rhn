package com.rhn.platform.printing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_PRINT_BATCH_ITEM")
public class ClinicalPrintBatchItem {
    @Id @Column(name = "ID_PRINT_BATCH_ITEM") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PRINT_BATCH", nullable = false) private Long batchId;
    @Column(name = "SD_SRC_TYPE", nullable = false) private String sourceType;
    @Column(name = "ID_SRC", nullable = false) private Long sourceId;
    @Column(name = "SN_SRC_VER", nullable = false) private long sourceVersion;
    @Column(name = "ID_PAT") private Long residentId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "CD_GROUP_KEY", nullable = false) private String groupKey;
    @Column(name = "ID_ITEM_KEY", nullable = false) private String itemKey;
    @Lob @Column(name = "JSON_SNAPSHOT") private String snapshotJson;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_EXCLUDE_REASON") private String exclusionCode;
    @Column(name = "DES_EXCLUDE_REASON") private String exclusionReason;
    @Column(name = "SN_PAGE") private Integer pageNo;
    @Column(name = "SN_SLOT") private Integer slotNo;
    @Column(name = "DES_REPRINT_REASON") private String reprintReason;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected ClinicalPrintBatchItem() {}

    public ClinicalPrintBatchItem(Long tenantId, Long batchId, Long sourceId, long sourceVersion,
                                  Long residentId, Long encounterId, String groupKey, String itemKey,
                                  String snapshotJson, String status, String exclusionCode, String exclusionReason,
                                  Integer pageNo, Integer slotNo, String reprintReason) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.batchId = batchId;
        this.sourceType = "TREATMENT_EXECUTION_TASK"; this.sourceId = sourceId; this.sourceVersion = sourceVersion;
        this.residentId = residentId; this.encounterId = encounterId; this.groupKey = groupKey;
        this.itemKey = itemKey; this.snapshotJson = snapshotJson; this.status = status;
        this.exclusionCode = exclusionCode; this.exclusionReason = exclusionReason;
        this.pageNo = pageNo; this.slotNo = slotNo; this.reprintReason = reprintReason;
        this.createdAt = Instant.now();
    }

    public Long id() { return id; }
    public Long batchId() { return batchId; }
    public Long sourceId() { return sourceId; }
    public long sourceVersion() { return sourceVersion; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public String groupKey() { return groupKey; }
    public String itemKey() { return itemKey; }
    public String snapshotJson() { return snapshotJson; }
    public String status() { return status; }
    public String exclusionCode() { return exclusionCode; }
    public String exclusionReason() { return exclusionReason; }
    public Integer pageNo() { return pageNo; }
    public Integer slotNo() { return slotNo; }
    public String reprintReason() { return reprintReason; }
}
