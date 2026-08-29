package com.rhn.diagnostics.domain;

import java.io.Serializable;
import java.util.Objects;

public class DiagnosticReportResultId implements Serializable {
    private Long tenantId;
    private Long reportId;
    private Long observationId;

    public DiagnosticReportResultId() {}
    public DiagnosticReportResultId(Long tenantId, Long reportId, Long observationId) {
        this.tenantId = tenantId; this.reportId = reportId; this.observationId = observationId;
    }

    @Override public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof DiagnosticReportResultId value)) return false;
        return Objects.equals(tenantId, value.tenantId) && Objects.equals(reportId, value.reportId)
                && Objects.equals(observationId, value.observationId);
    }
    @Override public int hashCode() { return Objects.hash(tenantId, reportId, observationId); }
}
