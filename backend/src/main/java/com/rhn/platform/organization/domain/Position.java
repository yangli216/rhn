package com.rhn.platform.organization.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "positions")
public class Position {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Enumerated(EnumType.STRING)
    @Column(name = "position_type", nullable = false) private PositionType positionType;
    @Column(name = "duty_description") private String dutyDescription;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PersonnelStatus status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;
    @Version @Column(name = "revision", nullable = false) private long revision;

    protected Position() {
    }

    public Position(Long tenantId, String code, String name, PositionType positionType,
                    String dutyDescription, Long actorId) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.code = code;
        this.name = name;
        this.positionType = positionType;
        this.dutyDescription = dutyDescription;
        this.status = PersonnelStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = this.createdAt;
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String code() { return code; }
    public String name() { return name; }
    public PositionType positionType() { return positionType; }
    public String dutyDescription() { return dutyDescription; }
    public PersonnelStatus status() { return status; }
    public long revision() { return revision; }
}
