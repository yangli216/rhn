package com.rhn.platform.organization.domain;

import com.rhn.platform.organization.api.TenantView;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_TNT")
public class Tenant {
    @Id
    @Column(name = "ID_TNT") private Long id;
    @Column(name = "CD_TNT", nullable = false)
    private String code;
    @Column(name = "NA_TNT", nullable = false)
    private String name;
    @Column(name = "CD_TZ", nullable = false)
    private String timezoneCode;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false)
    private FoundationStatus status;
    @Column(name = "DT_CREATED", nullable = false)
    private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false)
    private Instant updatedAt;
    @Version
    @Column(name = "REVISION", nullable = false)
    private long revision;

    protected Tenant() {
    }

    public Tenant(Long id, String code, String name) {
        this.id = id;
        this.code = code;
        this.name = name;
        this.timezoneCode = "Asia/Shanghai";
        this.status = FoundationStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public TenantView toView() {
        return new TenantView(id, code, name, status.name());
    }
}
