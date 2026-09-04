package com.rhn.diagnostics.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

@Entity
@IdClass(DiagnosticReportResultId.class)
@Table(name = "RHN_EX_DIAG_REPORT_RESULT")
public class DiagnosticReportResult {
    @Id @Column(name = "ID_TNT") private Long tenantId;
    @Id @Column(name = "ID_DIAG_REPORT") private Long reportId;
    @Id @Column(name = "ID_OBS") private Long observationId;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;

    protected DiagnosticReportResult() {}
    public DiagnosticReportResult(Long tenantId, Long reportId, Long observationId, int sortOrder) {
        this.tenantId = tenantId; this.reportId = reportId;
        this.observationId = observationId; this.sortOrder = sortOrder;
    }
    public Long observationId() { return observationId; } public int sortOrder() { return sortOrder; }
}
