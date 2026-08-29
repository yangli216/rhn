package com.rhn.diagnostics.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record DiagnosticReportResponse(
        Long id, Long residentId, Long encounterId, Long requestId,
        String endpointCode, String externalReportId, int reportVersion, Long replacesReportId,
        String reportType, String status, String reportCode, String reportName,
        Instant issuedAt, Instant receivedAt, String conclusion, String authorCode, String authorName,
        String contentDigestAlgorithm, String contentDigest, Long inboundMessageId,
        List<ObservationView> observations) {

    public record ObservationView(
            Long id, int sortOrder, String codeSystemUri, String codeRelease,
            String observationCode, String observationName, String status, String valueType,
            Instant effectiveAt, String valueString, BigDecimal valueNumber, Boolean valueBoolean,
            String valueCode, Instant valueDateTime, String unitCode,
            BigDecimal referenceRangeLow, BigDecimal referenceRangeHigh, String interpretationCode,
            String performerCode, String performerName) {}
}
