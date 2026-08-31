package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "care_episodes")
public class CareEpisode {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "episode_no", nullable = false) private String episodeNo;
    @Column(name = "episode_type", nullable = false) private String episodeType;
    @Column(nullable = false) private String status;
    @Column(name = "start_at", nullable = false) private Instant startAt;
    @Column(name = "end_at") private Instant endAt;
    @Column(name = "primary_practitioner_id") private Long primaryPractitionerId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected CareEpisode() {
    }

    public CareEpisode(Long tenantId, Long residentId, Long organizationId, String episodeNo,
                       Long primaryPractitionerId, Long actorId) {
        this(tenantId, residentId, organizationId, episodeNo, primaryPractitionerId, actorId, Instant.now());
    }

    public CareEpisode(Long tenantId, Long residentId, Long organizationId, String episodeNo,
                       Long primaryPractitionerId, Long actorId, Instant admittedAt) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.residentId = residentId;
        this.organizationId = organizationId;
        this.episodeNo = episodeNo;
        this.episodeType = "INPATIENT";
        this.status = "ADMITTED";
        this.startAt = admittedAt;
        this.primaryPractitionerId = primaryPractitionerId;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void recordMovement(long expectedRevision, Long actorId) {
        requireAdmitted(expectedRevision);
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public void discharge(long expectedRevision, Long actorId) {
        requireAdmitted(expectedRevision);
        this.status = "DISCHARGED";
        this.endAt = Instant.now();
        this.updatedAt = endAt;
        this.updatedBy = actorId;
    }

    private void requireAdmitted(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("STALE_REVISION");
        if (!"ADMITTED".equals(status)) throw new IllegalStateException("NOT_ADMITTED");
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long residentId() { return residentId; }
    public Long organizationId() { return organizationId; }
    public String episodeNo() { return episodeNo; }
    public String status() { return status; }
    public Instant startAt() { return startAt; }
    public Instant endAt() { return endAt; }
    public Long primaryPractitionerId() { return primaryPractitionerId; }
}
