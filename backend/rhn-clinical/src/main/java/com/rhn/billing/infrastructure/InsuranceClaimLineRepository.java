package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.InsuranceClaimLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InsuranceClaimLineRepository extends JpaRepository<InsuranceClaimLine, Long> {
    List<InsuranceClaimLine> findByTenantIdAndClaimIdOrderByLineNoAsc(Long tenantId, Long claimId);
}
