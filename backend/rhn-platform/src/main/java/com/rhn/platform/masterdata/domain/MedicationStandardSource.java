package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
import java.time.Instant;

/** Durable provenance, independent of the editable operational medication code. */
@Entity
@Table(name = "RHN_BD_MED_STD_SOURCE")
public class MedicationStandardSource {
    @Id @Column(name = "ID_MED_STD_SOURCE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_MED", nullable = false) private Long medicationId;
    @Column(name = "CD_CATALOG", nullable = false) private String catalogCode;
    @Column(name = "CATALOG_VERSION", nullable = false) private String catalogVersion;
    @Column(name = "CD_STD_ENTRY", nullable = false) private String entryCode;
    @Column(name = "CD_STD_SPEC", nullable = false) private String specificationCode;
    @Column(name = "SOURCE_HASH", nullable = false) private String sourceHash;
    @Column(name = "CD_BINDING_CLAIM", nullable = false, length = 64) private String bindingClaim;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    protected MedicationStandardSource() {}
    public MedicationStandardSource(Long tenant, Long medication, String catalog, String version,
            String entry, String specification, String hash, Long actor) {
        this(tenant, medication, catalog, version, entry, specification, hash, actor, false);
    }
    public MedicationStandardSource(Long tenant, Long medication, String catalog, String version,
            String entry, String specification, String hash, Long actor, boolean existingLocalRecord) {
        id = GlobalIds.next(); tenantId = tenant; medicationId = medication; catalogCode = catalog;
        catalogVersion = version; entryCode = entry; specificationCode = specification;
        sourceHash = hash; createdAt = Instant.now(); createdBy = actor;
        bindingClaim = existingLocalRecord ? "EXISTING:" + medication : "CANONICAL";
    }
    public Long id() { return id; }
    public Long createdBy() { return createdBy; }
    public Instant createdAt() { return createdAt; }
    public Long medicationId() { return medicationId; }
    public String catalogCode() { return catalogCode; }
    public String catalogVersion() { return catalogVersion; }
    public String entryCode() { return entryCode; }
    public String specificationCode() { return specificationCode; }
    public String sourceHash() { return sourceHash; }
}
