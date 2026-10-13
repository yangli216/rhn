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
        List<ObservationView> observations, String findings, Long authorId, Long signerId,
        String signerName, Boolean selfVerified, String correctionReason, Boolean doubleSignatureRequired,
        List<DiagnosticImageView> images, Long templateVersionId, String templateSnapshot) {
    public DiagnosticReportResponse(Long id, Long residentId, Long encounterId, Long requestId,
            String endpointCode, String externalReportId, int reportVersion, Long replacesReportId,
            String reportType, String status, String reportCode, String reportName, Instant issuedAt,
            Instant receivedAt, String conclusion, String authorCode, String authorName,
            String contentDigestAlgorithm, String contentDigest, Long inboundMessageId, List<ObservationView> observations) {
        this(id, residentId, encounterId, requestId, endpointCode, externalReportId, reportVersion, replacesReportId,
                reportType, status, reportCode, reportName, issuedAt, receivedAt, conclusion, authorCode, authorName,
                contentDigestAlgorithm, contentDigest, inboundMessageId, observations, null, null, null, null, null, null, null, List.of(), null, null);
    }

    public record ObservationView(
            Long id, int sortOrder, String codeSystemUri, String codeRelease,
            String observationCode, String observationName, String status, String valueType,
            Instant effectiveAt, String valueString, BigDecimal valueNumber, Boolean valueBoolean,
            String valueCode, Instant valueDateTime, String unitCode,
            BigDecimal referenceRangeLow, BigDecimal referenceRangeHigh, String interpretationCode,
            String performerCode, String performerName, String valueComparator, String ruleStatus, String ruleSnapshot) {
        public ObservationView(Long id, int sortOrder, String codeSystemUri, String codeRelease, String observationCode,
                String observationName, String status, String valueType, Instant effectiveAt, String valueString,
                BigDecimal valueNumber, Boolean valueBoolean, String valueCode, Instant valueDateTime, String unitCode,
                BigDecimal referenceRangeLow, BigDecimal referenceRangeHigh, String interpretationCode,
                String performerCode, String performerName) {
            this(id,sortOrder,codeSystemUri,codeRelease,observationCode,observationName,status,valueType,effectiveAt,
                valueString,valueNumber,valueBoolean,valueCode,valueDateTime,unitCode,referenceRangeLow,referenceRangeHigh,
                interpretationCode,performerCode,performerName,null,null,null);
        }
    }
}
