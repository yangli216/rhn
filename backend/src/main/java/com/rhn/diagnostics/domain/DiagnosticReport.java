package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "diagnostic_reports")
public class DiagnosticReport {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "endpoint_code", nullable = false) private String endpointCode;
    @Column(name = "external_report_id", nullable = false) private String externalReportId;
    @Column(name = "report_version", nullable = false) private int reportVersion;
    @Column(name = "replaces_report_id") private Long replacesReportId;
    @Column(name = "report_type", nullable = false) private String reportType;
    @Column(nullable = false) private String status;
    @Column(name = "report_code", nullable = false) private String reportCode;
    @Column(name = "report_name", nullable = false) private String reportName;
    @Column(name = "issued_at", nullable = false) private Instant issuedAt;
    @Column(name = "received_at", nullable = false) private Instant receivedAt;
    @Lob private String conclusion;
    @Column(name = "author_code") private String authorCode;
    @Column(name = "author_name") private String authorName;
    @Column(name = "content_digest_algorithm", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "content_digest", nullable = false) private String contentDigest;
    @Column(name = "inbound_message_id", nullable = false) private Long inboundMessageId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    protected DiagnosticReport() {}

    public DiagnosticReport(Long tenantId, Long residentId, Long encounterId, Long requestId,
                            String endpointCode, String externalReportId, int reportVersion,
                            Long replacesReportId, String reportType, String status,
                            String reportCode, String reportName, Instant issuedAt, String conclusion,
                            String authorCode, String authorName, String contentDigest,
                            Long inboundMessageId, Long createdBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId; this.requestId = requestId; this.endpointCode = endpointCode;
        this.externalReportId = externalReportId; this.reportVersion = reportVersion;
        this.replacesReportId = replacesReportId; this.reportType = reportType; this.status = status;
        this.reportCode = reportCode; this.reportName = reportName; this.issuedAt = issuedAt;
        this.receivedAt = Instant.now(); this.conclusion = conclusion; this.authorCode = authorCode;
        this.authorName = authorName; this.contentDigestAlgorithm = "SHA-256";
        this.contentDigest = contentDigest; this.inboundMessageId = inboundMessageId;
        this.createdAt = this.receivedAt; this.createdBy = createdBy;
    }

    public Long id() { return id; } public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; } public Long encounterId() { return encounterId; }
    public Long requestId() { return requestId; } public String endpointCode() { return endpointCode; }
    public String externalReportId() { return externalReportId; } public int reportVersion() { return reportVersion; }
    public Long replacesReportId() { return replacesReportId; } public String reportType() { return reportType; }
    public String status() { return status; } public String reportCode() { return reportCode; }
    public String reportName() { return reportName; } public Instant issuedAt() { return issuedAt; }
    public Instant receivedAt() { return receivedAt; } public String conclusion() { return conclusion; }
    public String authorCode() { return authorCode; } public String authorName() { return authorName; }
    public String contentDigestAlgorithm() { return contentDigestAlgorithm; } public String contentDigest() { return contentDigest; }
    public Long inboundMessageId() { return inboundMessageId; } public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
}
