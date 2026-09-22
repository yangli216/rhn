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
@Table(name = "RHN_SYS_POS")
public class Position {
    @Id @Column(name = "ID_POS") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_POS", nullable = false) private String code;
    @Column(name = "NA_POS", nullable = false) private String name;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_POS_TYPE", nullable = false) private PositionType positionType;
    @Column(name = "DES_DUTY_DESCR") private String dutyDescription;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private PersonnelStatus status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;
    @Version @Column(name = "REVISION", nullable = false) private long revision;

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
