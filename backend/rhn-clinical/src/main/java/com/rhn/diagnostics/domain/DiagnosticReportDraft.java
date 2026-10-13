package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

/** A saved working copy. Issuance freezes a separate versioned DiagnosticReport. */
@Entity
@Table(name = "RHN_EX_DIAG_DRAFT")
public class DiagnosticReportDraft {
    @Id @Column(name = "ID_DIAG_DRAFT") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_DIAG_EXEC_TASK", nullable = false) private Long taskId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "JSON_CONTENT", nullable = false) private String content;
    @Column(name = "ID_USER_AUTHOR", nullable = false) private Long authorId;
    @Column(name = "NA_AUTHOR", nullable = false) private String authorName;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_DIAG_REPORT") private Long issuedReportId;
    @Column(name = "CD_CMD") private String issueCommandId;

    protected DiagnosticReportDraft() {}

    public DiagnosticReportDraft(Long tenantId, Long taskId, String content, Long authorId, String authorName) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.taskId = taskId;
        update(content, authorId, authorName);
    }

    public void update(String value, Long actor, String actorName) {
        content = value; authorId = actor; authorName = actorName; updatedAt = Instant.now();
        issuedReportId = null; issueCommandId = null;
    }

    public void issued(Long reportId, String commandId) {
        issuedReportId = reportId; issueCommandId = commandId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long taskId() { return taskId; }
    public String content() { return content; }
    public Long authorId() { return authorId; }
    public String authorName() { return authorName; }
    public Instant updatedAt() { return updatedAt; }
    public Long issuedReportId() { return issuedReportId; }
    public String issueCommandId() { return issueCommandId; }
}
