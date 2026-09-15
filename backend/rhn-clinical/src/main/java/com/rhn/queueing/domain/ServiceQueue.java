package com.rhn.queueing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SC_SVC_QUEUE")
public class ServiceQueue {
    @Id @Column(name = "ID_SVC_QUEUE") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_SVC_LOC_WAITING") private Long waitingLocationId;
    @Column(name = "CD_SVC_QUEUE", nullable = false) private String code;
    @Column(name = "NA_SVC_QUEUE", nullable = false) private String name;
    @Column(name = "SD_SCENE", nullable = false) private String scene;
    @Column(name = "CD_TICKET_PREFIX", nullable = false) private String ticketPrefix;
    @Column(name = "FG_ACTIVE", nullable = false) private boolean active;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ServiceQueue() {}

    public ServiceQueue(Long tenantId, Long organizationId, Long departmentId, Long waitingLocationId,
                        String code, String name, String scene, String ticketPrefix, Long actorId, Instant now) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.waitingLocationId = waitingLocationId;
        this.code = code;
        this.name = name;
        this.scene = scene;
        this.ticketPrefix = ticketPrefix;
        this.active = true;
        this.createdAt = now;
        this.createdBy = actorId;
        this.updatedAt = now;
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long waitingLocationId() { return waitingLocationId; }
    public String code() { return code; }
    public String name() { return name; }
    public String scene() { return scene; }
    public String ticketPrefix() { return ticketPrefix; }
    public boolean active() { return active; }
}
