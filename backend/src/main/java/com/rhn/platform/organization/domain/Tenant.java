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
@Table(name = "tenants")
public class Tenant {
    @Id
    private Long id;
    @Column(nullable = false)
    private String code;
    @Column(nullable = false)
    private String name;
    @Column(name = "timezone_code", nullable = false)
    private String timezoneCode;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FoundationStatus status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Version
    @Column(name = "revision", nullable = false)
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
