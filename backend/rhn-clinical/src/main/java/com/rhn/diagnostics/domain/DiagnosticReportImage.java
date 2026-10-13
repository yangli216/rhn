package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "RHN_EX_REPORT_IMAGE")
public class DiagnosticReportImage {
    @Id @Column(name = "ID_REPORT_IMAGE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_DIAG_REPORT", nullable = false) private Long reportId;
    @Column(name = "ID_DIAG_IMAGE", nullable = false) private Long imageId;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;

    protected DiagnosticReportImage() {}

    public DiagnosticReportImage(Long tenantId, Long reportId, Long imageId, int sortOrder) {
        this.id = GlobalIds.next(); this.tenantId = tenantId;
        this.reportId = reportId; this.imageId = imageId; this.sortOrder = sortOrder;
    }
    public Long imageId() { return imageId; }
    public int sortOrder() { return sortOrder; }
}
