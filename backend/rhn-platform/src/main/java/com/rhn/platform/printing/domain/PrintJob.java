package com.rhn.platform.printing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_PRINT_JOB")
public class PrintJob {
    @Id @Column(name = "ID_PRINT_JOB") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PRINT_OUTPUT", nullable = false) private Long outputId;
    @Column(name = "ID_PRINT_JOB_ORIG") private Long originalJobId;
    @Column(name = "SD_REQ_TYPE", nullable = false) private String requestType;
    @Column(name = "QTY_COPIES", nullable = false) private int copies;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_REQD", nullable = false) private Instant requestedAt;
    @Column(name = "ID_USER_REQD", nullable = false) private Long requestedBy;
    @Column(name = "ID_CORR", nullable = false) private String correlationId;

    protected PrintJob() {}

    public PrintJob(Long tenantId, Long outputId, Long originalJobId, String requestType, int copies,
                    Long requestedBy, String correlationId) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.outputId = outputId;
        this.originalJobId = originalJobId; this.requestType = requestType; this.copies = copies;
        this.status = "GENERATED"; this.requestedAt = Instant.now(); this.requestedBy = requestedBy;
        this.correlationId = correlationId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long outputId() { return outputId; }
    public Long originalJobId() { return originalJobId; }
    public String requestType() { return requestType; }
    public int copies() { return copies; }
    public String status() { return status; }
    public Instant requestedAt() { return requestedAt; }
    public Long requestedBy() { return requestedBy; }
}
