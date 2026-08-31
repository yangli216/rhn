package com.rhn.platform.printing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "print_jobs")
public class PrintJob {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "output_id", nullable = false) private Long outputId;
    @Column(name = "original_job_id") private Long originalJobId;
    @Column(name = "request_type", nullable = false) private String requestType;
    @Column(nullable = false) private int copies;
    @Column(nullable = false) private String status;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;
    @Column(name = "requested_by", nullable = false) private Long requestedBy;
    @Column(name = "correlation_id", nullable = false) private String correlationId;

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
