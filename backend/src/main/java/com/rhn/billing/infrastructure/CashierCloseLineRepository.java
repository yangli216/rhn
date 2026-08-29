package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.CashierCloseLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CashierCloseLineRepository extends JpaRepository<CashierCloseLine, Long> {
    List<CashierCloseLine> findByTenantIdAndCashierCloseIdOrderByLineNo(Long tenantId, Long cashierCloseId);
}
