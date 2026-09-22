package com.rhn.platform.identityaccess.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_USER_ACCT")
public class UserAccount {
    @Id
    @Column(name = "ID_USER") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_PRACT")
    private Long practitionerId;
    @Column(name = "CD_USRNM", nullable = false)
    private String username;
    @Column(name = "HASH_PWD", nullable = false)
    private String passwordHash;
    @Column(name = "SD_STATUS", nullable = false)
    private String status;
    @Column(name = "DT_PWD_CHANGED")
    private Instant passwordChangedAt;
    @Column(name = "DT_LAST_LOGIN")
    private Instant lastLoginAt;
    @Column(name = "DT_CREATED", nullable = false)
    private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false)
    private Instant updatedAt;
    @Version
    @Column(name = "REVISION") private long version;

    protected UserAccount() {
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long practitionerId() { return practitionerId; }
    public String username() { return username; }
    public String passwordHash() { return passwordHash; }
    public String status() { return status; }
}
