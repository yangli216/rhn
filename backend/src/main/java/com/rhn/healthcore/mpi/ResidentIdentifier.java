package com.rhn.healthcore.mpi;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "resident_identifiers")
class ResidentIdentifier {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "resident_id", nullable = false)
    private Long residentId;
    @Column(name = "identifier_system", nullable = false)
    private String identifierSystem;
    @Column(name = "identifier_value", nullable = false)
    private String identifierValue;
    @Column(name = "normalized_value", nullable = false)
    private String normalizedValue;
    @Column(name = "use_type", nullable = false)
    private String useType;
    @Column(nullable = false)
    private String status;
    @Column(name = "source_organization_id")
    private Long sourceOrganizationId;
    @Column(name = "valid_from", nullable = false)
    private LocalDate validFrom;
    @Column(name = "valid_to")
    private LocalDate validTo;
    @Column(name = "created_at", nullable = false)
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
