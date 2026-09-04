package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_EX_DIAG_REPORT")
public class DiagnosticReport {
    @Id @Column(name = "ID_DIAG_REPORT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "CD_ENDPOINT", nullable = false) private String endpointCode;
    @Column(name = "ID_EXT_REPORT", nullable = false) private String externalReportId;
    @Column(name = "SN_REPORT_VER", nullable = false) private int reportVersion;
    @Column(name = "ID_DIAG_REPORT_REPLACES") private Long replacesReportId;
    @Column(name = "SD_REPORT_TYPE", nullable = false) private String reportType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "CD_REPORT", nullable = false) private String reportCode;
    @Column(name = "NA_REPORT", nullable = false) private String reportName;
    @Column(name = "DT_ISSUED", nullable = false) private Instant issuedAt;
    @Column(name = "DT_RECEIVED", nullable = false) private Instant receivedAt;
    @Lob @Column(name = "DES_CONCLUSION") private String conclusion;
    @Column(name = "CD_AUTHOR") private String authorCode;
    @Column(name = "NA_AUTHOR") private String authorName;
    @Column(name = "CONTENT_DIGEST_ALGORITHM", nullable = false) private String contentDigestAlgorithm;
    @Column(name = "HASH_CONTENT", nullable = false) private String contentDigest;
    @Column(name = "ID_EXT_MSG_INBOUND", nullable = false) private Long inboundMessageId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

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
