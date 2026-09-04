package com.rhn.platform.organization.domain;

import com.rhn.platform.organization.api.StaffView;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "practitioners")
public class Practitioner {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(nullable = false) private String code;
    @Column(name = "full_name", nullable = false) private String fullName;
    @Enumerated(EnumType.STRING) @Column private PractitionerGender gender;
    @Column(name = "identity_hash") private String identityHash;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PersonnelStatus status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;
    @Version @Column(name = "revision", nullable = false) private long revision;

    protected Practitioner() {
    }

    public Practitioner(Long tenantId, String code, String fullName, PractitionerGender gender, Long actorId) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.code = code;
        this.fullName = fullName;
        this.gender = gender;
        this.status = PersonnelStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = this.createdAt;
        this.updatedBy = actorId;
    }

    public void update(String fullName, PractitionerGender gender, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        this.fullName = fullName;
        this.gender = gender;
        touch(actorId);
    }

    public void changeStatus(PersonnelStatus status, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        this.status = status;
        touch(actorId);
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new StaleOrganizationRevisionException();
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String code() { return code; }
    public String fullName() { return fullName; }
    public PractitionerGender gender() { return gender; }
    public PersonnelStatus status() { return status; }
    public long revision() { return revision; }

    public StaffView toView() {
        return new StaffView(id, revision, code, fullName, gender == null ? null : gender.name(),
                status.name(), createdAt, updatedAt);
    }
}
