package com.rhn.diagnostics.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

@Entity
@IdClass(DiagnosticReportResultId.class)
@Table(name = "diagnostic_report_results")
public class DiagnosticReportResult {
    @Id @Column(name = "tenant_id") private Long tenantId;
    @Id @Column(name = "report_id") private Long reportId;
    @Id @Column(name = "observation_id") private Long observationId;
    @Column(name = "sort_order", nullable = false) private int sortOrder;

    protected DiagnosticReportResult() {}
    public DiagnosticReportResult(Long tenantId, Long reportId, Long observationId, int sortOrder) {
        this.tenantId = tenantId; this.reportId = reportId;
        this.observationId = observationId; this.sortOrder = sortOrder;
    }
    public Long observationId() { return observationId; } public int sortOrder() { return sortOrder; }
}
