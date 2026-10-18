package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefApplication;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ReliefApplicationRepository extends JpaRepository<ReliefApplication, Long> {
    Optional<ReliefApplication> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
    List<ReliefApplication> findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(Long tenantId, Long settlementId);
    List<ReliefApplication> findByTenantIdAndReversesApplicationId(Long tenantId, Long reversesApplicationId);
}
