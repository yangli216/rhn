package com.rhn.healthcore.mpi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface ResidentIdentifierRepository extends JpaRepository<ResidentIdentifier, Long> {
    Optional<ResidentIdentifier> findByTenantIdAndIdentifierSystemAndNormalizedValueAndStatus(
            Long tenantId, String identifierSystem, String normalizedValue, String status);
    List<ResidentIdentifier> findByTenantIdAndResidentIdAndStatusOrderByCreatedAt(
            Long tenantId, Long residentId, String status);
    List<ResidentIdentifier> findTop20ByTenantIdAndNormalizedValueContainingIgnoreCaseAndStatus(
            Long tenantId, String normalizedValue, String status);
}
