package com.rhn.healthcore.mpi;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_PI_PAT_IDENT")
class ResidentIdentifier {
    @Id
    @Column(name = "ID_PAT_IDENT") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_PAT", nullable = false)
    private Long residentId;
    @Column(name = "CD_IDENT_SYS", nullable = false)
    private String identifierSystem;
    @Column(name = "CD_IDENT_VAL", nullable = false)
    private String identifierValue;
    @Column(name = "NORMALIZED_VALUE", nullable = false)
    private String normalizedValue;
    @Column(name = "SD_USE_TYPE", nullable = false)
    private String useType;
    @Column(name = "SD_STATUS", nullable = false)
    private String status;
    @Column(name = "ID_ORG_SRC")
    private Long sourceOrganizationId;
    @Column(name = "DA_VALID_FROM", nullable = false)
    private LocalDate validFrom;
    @Column(name = "DA_VALID_TO")
    private LocalDate validTo;
    @Column(name = "DT_CREATED", nullable = false)
    private Instant createdAt;

    protected ResidentIdentifier() {
    }

    ResidentIdentifier(Long tenantId, Long residentId, String identifierSystem, String identifierValue,
                       String normalizedValue, String useType, Long sourceOrganizationId) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.residentId = residentId;
        this.identifierSystem = identifierSystem;
        this.identifierValue = identifierValue;
        this.normalizedValue = normalizedValue;
        this.useType = useType;
        this.status = "ACTIVE";
        this.sourceOrganizationId = sourceOrganizationId;
        this.validFrom = LocalDate.now();
        this.createdAt = Instant.now();
    }

    void assignTo(Long residentId) { this.residentId = residentId; }
    Long id() { return id; }
    Long residentId() { return residentId; }
    String identifierSystem() { return identifierSystem; }
    String identifierValue() { return identifierValue; }
    String normalizedValue() { return normalizedValue; }
    String useType() { return useType; }
    String status() { return status; }
}
