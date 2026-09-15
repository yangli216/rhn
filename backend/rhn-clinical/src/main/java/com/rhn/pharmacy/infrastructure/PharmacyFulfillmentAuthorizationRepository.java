package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.PharmacyFulfillmentAuthorization;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PharmacyFulfillmentAuthorizationRepository
        extends JpaRepository<PharmacyFulfillmentAuthorization, Long> {
    Optional<PharmacyFulfillmentAuthorization> findByTenantIdAndMedicationRequestIdAndSettlementId(
            Long tenantId, Long medicationRequestId, Long settlementId);
    Optional<PharmacyFulfillmentAuthorization> findTopByTenantIdAndMedicationRequestIdOrderByReadyAtDesc(
            Long tenantId, Long medicationRequestId);
    List<PharmacyFulfillmentAuthorization> findByTenantIdAndSettlementId(Long tenantId, Long settlementId);
}
