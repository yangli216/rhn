package com.rhn.platform.organization.domain;

import com.rhn.platform.organization.api.StaffView;
import com.rhn.shared.api.StaleRevisionException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_PRACT")
public class Practitioner {
    @Id @Column(name = "ID_PRACT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_PRACT", nullable = false) private String code;
    @Column(name = "NA_FULL", nullable = false) private String fullName;
    @Enumerated(EnumType.STRING) @Column(name = "SD_GENDER") private PractitionerGender gender;
    @Column(name = "HASH_IDENT") private String identityHash;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private PersonnelStatus status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;
    @Version @Column(name = "REVISION", nullable = false) private long revision;

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
        if (revision != expectedRevision) {
            throw new StaleRevisionException(revision, "人员已被其他用户修改，请刷新后重试");
        }
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
