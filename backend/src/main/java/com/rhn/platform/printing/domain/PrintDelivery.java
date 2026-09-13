package com.rhn.platform.printing.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_PRINT_DELIVERY")
public class PrintDelivery {
    @Id @Column(name = "ID_PRINT_DELIVERY") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PRINT_BATCH") private Long batchId;
    @Column(name = "ID_PRINT_JOB", nullable = false) private Long jobId;
    @Column(name = "ID_PRINT_DEVICE") private Long deviceId;
    @Column(name = "SD_CHANNEL", nullable = false) private String channel;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "QTY_ATTEMPT", nullable = false) private int attemptCount;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR") private String errorMessage;
    @Column(name = "DT_QUEUED") private Instant queuedAt;
    @Column(name = "DT_SENT") private Instant sentAt;
    @Column(name = "DT_CONFIRMED") private Instant confirmedAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected PrintDelivery() {}

    public PrintDelivery(Long tenantId, Long batchId, Long jobId, Long deviceId, String channel) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.batchId = batchId; this.jobId = jobId;
        this.deviceId = deviceId; this.channel = channel; this.status = "GENERATED";
        this.updatedAt = Instant.now();
    }

    public void queue(long expectedRevision) {
        requireRevision(expectedRevision); this.status = "QUEUED"; this.attemptCount++;
        this.queuedAt = Instant.now(); this.updatedAt = queuedAt; clearError();
    }
    public void sent(long expectedRevision) {
        requireRevision(expectedRevision);
        if (!"QUEUED".equals(this.status)) this.attemptCount++;
        this.status = "SENT";
        this.sentAt = Instant.now(); this.updatedAt = sentAt; clearError();
    }
    public void confirm(long expectedRevision) {
        requireRevision(expectedRevision); this.status = "DEVICE_CONFIRMED";
        this.confirmedAt = Instant.now(); this.updatedAt = confirmedAt; clearError();
    }
    public void fail(long expectedRevision, String code, String message) {
        requireRevision(expectedRevision); this.status = "FAILED"; this.errorCode = code;
        this.errorMessage = message; this.updatedAt = Instant.now();
    }
    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new BusinessException(
                "PRINT_DELIVERY_REVISION_CONFLICT", "打印投递状态已变化，请刷新后重试", HttpStatus.CONFLICT);
    }
    private void clearError() { this.errorCode = null; this.errorMessage = null; }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long batchId() { return batchId; }
    public Long jobId() { return jobId; }
    public Long deviceId() { return deviceId; }
    public String channel() { return channel; }
    public String status() { return status; }
    public int attemptCount() { return attemptCount; }
    public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }
    public Instant queuedAt() { return queuedAt; }
    public Instant sentAt() { return sentAt; }
    public Instant confirmedAt() { return confirmedAt; }
    public Instant updatedAt() { return updatedAt; }
}
