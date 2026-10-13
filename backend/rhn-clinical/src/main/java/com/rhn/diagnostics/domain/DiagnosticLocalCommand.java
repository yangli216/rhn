package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Immutable local issue receipt. It outlives the mutable report working copy. */
@Entity
@Table(name = "RHN_EX_DIAG_CMD")
public class DiagnosticLocalCommand {
    @Id @Column(name = "ID_DIAG_CMD") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_DIAG_EXEC_TASK", nullable = false) private Long taskId;
    @Column(name = "CD_CMD", nullable = false) private String commandId;
    @Column(name = "HASH_CMD", nullable = false) private String contentHash;
    @Column(name = "ID_DIAG_REPORT", nullable = false) private Long reportId;

    protected DiagnosticLocalCommand() {}
    public DiagnosticLocalCommand(Long tenantId, Long taskId, String commandId, String hash, Long reportId) {
        id = GlobalIds.next(); this.tenantId = tenantId; this.taskId = taskId;
        this.commandId = commandId; contentHash = hash; this.reportId = reportId;
    }
    public String contentHash() { return contentHash; }
    public Long reportId() { return reportId; }
}
