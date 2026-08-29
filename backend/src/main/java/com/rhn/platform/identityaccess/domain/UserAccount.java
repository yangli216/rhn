package com.rhn.platform.identityaccess.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "user_accounts")
public class UserAccount {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "practitioner_id")
    private Long practitionerId;
    @Column(nullable = false)
    private String username;
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;
    @Column(nullable = false)
    private String status;
    @Column(name = "password_changed_at")
    private Instant passwordChangedAt;
    @Column(name = "last_login_at")
    private Instant lastLoginAt;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Version
    private long version;

    protected UserAccount() {
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long practitionerId() { return practitionerId; }
    public String username() { return username; }
    public String passwordHash() { return passwordHash; }
    public String status() { return status; }
}
