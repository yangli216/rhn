package com.rhn.diagnostics.api;

import java.util.List;

/** Read-only diagnostic reports already authorized for the current clinical work context. */
public interface DiagnosticReportDirectory {
    List<DiagnosticReportResponse> listByEncounter(Long encounterId);
}
