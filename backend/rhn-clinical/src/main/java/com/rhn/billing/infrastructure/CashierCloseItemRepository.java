package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.CashierCloseItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CashierCloseItemRepository extends JpaRepository<CashierCloseItem, Long> {
    List<CashierCloseItem> findByTenantIdAndCashierCloseIdOrderByItemNo(Long tenantId, Long cashierCloseId);
}
