package com.rhn.platform.printing.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

import org.springframework.http.HttpStatus;

@Entity
@Table(name = "RHN_META_PRINT_DEVICE")
public class PrintDevice {
    @Id @Column(name = "ID_PRINT_DEVICE") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG") private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "CD_DEVICE", nullable = false) private String deviceCode;
    @Column(name = "NA_DEVICE", nullable = false) private String deviceName;
    @Column(name = "SD_CHANNEL", nullable = false) private String channel;
    @Column(name = "SD_OUTPUT_LANG", nullable = false) private String outputLanguage;
    @Column(name = "NA_QUEUE") private String queueName;
    @Lob @Column(name = "JSON_CAPABILITIES", nullable = false) private String capabilitiesJson;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_LAST_SEEN") private Instant lastSeenAt;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected PrintDevice() {}

    public PrintDevice(Long tenantId, Long organizationId, Long departmentId, String deviceCode,
                       String deviceName, String channel, String outputLanguage, String queueName,
                       String capabilitiesJson, Long actorId) {
        Instant now = Instant.now();
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.deviceCode = deviceCode; this.deviceName = deviceName;
        this.channel = channel; this.outputLanguage = outputLanguage; this.queueName = queueName;
        this.capabilitiesJson = capabilitiesJson; this.status = "ACTIVE"; this.lastSeenAt = now;
        this.createdAt = now; this.createdBy = actorId; this.updatedAt = now; this.updatedBy = actorId;
    }

    public void heartbeat(Long actorId) {
        this.lastSeenAt = Instant.now(); this.status = "ACTIVE"; this.updatedAt = lastSeenAt; this.updatedBy = actorId;
    }

    public void update(long expectedRevision, Long organizationId, Long departmentId, String deviceName,
                       String channel, String outputLanguage, String queueName, String capabilitiesJson,
                       String status, Long actorId) {
        if (revision != expectedRevision) throw new BusinessException(
                "PRINT_DEVICE_REVISION_CONFLICT", "打印设备信息已变化，请刷新后重试", HttpStatus.CONFLICT);
        this.organizationId = organizationId; this.departmentId = departmentId; this.deviceName = deviceName;
        this.channel = channel; this.outputLanguage = outputLanguage; this.queueName = queueName;
        this.capabilitiesJson = capabilitiesJson; this.status = status; this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String deviceCode() { return deviceCode; }
    public String deviceName() { return deviceName; }
    public String channel() { return channel; }
    public String outputLanguage() { return outputLanguage; }
    public String queueName() { return queueName; }
    public String capabilitiesJson() { return capabilitiesJson; }
    public String status() { return status; }
    public Instant lastSeenAt() { return lastSeenAt; }
}
