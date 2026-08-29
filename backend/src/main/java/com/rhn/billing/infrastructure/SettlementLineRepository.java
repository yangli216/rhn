package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.SettlementLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SettlementLineRepository extends JpaRepository<SettlementLine, Long> {
    List<SettlementLine> findByTenantIdAndSettlementIdOrderByLineNoAsc(Long tenantId, Long settlementId);
}
