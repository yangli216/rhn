package com.rhn.diagnostics.api;

import java.time.Instant;

/** A report version summary; clinical contents remain in the immutable report detail. */
public record DiagnosticReportQueryRow(
        Long id, Long taskId, Long residentId, String residentName, String healthRecordNo,
        Long encounterId, Long requestId, String requestNo, String itemCode, String itemName,
        String specimenNo, String reportCode, String reportName, int reportVersion, Long replacesReportId,
        String reportType, String status, Instant issuedAt, String signerName, boolean current) {}
