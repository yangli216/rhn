package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.InsuranceClaimResponse;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InsuranceClaimResponseRepository extends JpaRepository<InsuranceClaimResponse, Long> {
    Optional<InsuranceClaimResponse> findByTenantIdAndClaimIdAndCommandCode(Long tenantId, Long claimId, String commandCode);
    List<InsuranceClaimResponse> findByTenantIdAndClaimIdOrderByRespondedAtAscIdAsc(Long tenantId, Long claimId);
}
