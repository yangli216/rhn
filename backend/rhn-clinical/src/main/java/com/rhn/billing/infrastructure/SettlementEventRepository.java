package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.SettlementEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SettlementEventRepository extends JpaRepository<SettlementEvent, Long> {
    Optional<SettlementEvent> findByTenantIdAndSettlementIdAndCommandCode(
            Long tenantId, Long settlementId, String commandCode);
    List<SettlementEvent> findByTenantIdAndSettlementIdOrderByIdAsc(Long tenantId, Long settlementId);
}
