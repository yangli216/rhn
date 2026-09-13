package com.rhn.platform.printing.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

import org.springframework.http.HttpStatus;

@Entity
@Table(name = "RHN_META_PRINT_DEV_BIND")
public class PrintDeviceBinding {
    @Id @Column(name = "ID_PRINT_DEV_BIND") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "CD_DOC_TYPE", nullable = false) private String documentType;
    @Column(name = "ID_PRINT_MEDIA", nullable = false) private Long mediaProfileId;
    @Column(name = "ID_PRINT_DEVICE", nullable = false) private Long deviceId;
    @Column(name = "FG_DEFAULT", nullable = false) private boolean defaultDevice;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected PrintDeviceBinding() {}

    public PrintDeviceBinding(Long tenantId, Long organizationId, Long departmentId, String documentType,
                              Long mediaProfileId, Long deviceId, boolean defaultDevice, Long actorId) {
        Instant now = Instant.now();
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.documentType = documentType; this.mediaProfileId = mediaProfileId;
        this.deviceId = deviceId; this.defaultDevice = defaultDevice; this.status = "ACTIVE";
        this.createdAt = now; this.createdBy = actorId; this.updatedAt = now; this.updatedBy = actorId;
    }

    public void update(long expectedRevision, Long deviceId, boolean defaultDevice, String status, Long actorId) {
        if (revision != expectedRevision) throw new BusinessException(
                "PRINT_DEVICE_BINDING_REVISION_CONFLICT", "打印设备路由已变化，请刷新后重试", HttpStatus.CONFLICT);
        this.deviceId = deviceId; this.defaultDevice = defaultDevice; this.status = status;
        this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public String documentType() { return documentType; }
    public Long mediaProfileId() { return mediaProfileId; }
    public Long deviceId() { return deviceId; }
    public boolean defaultDevice() { return defaultDevice; }
    public String status() { return status; }
}
