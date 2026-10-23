package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.CashierCloseEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CashierCloseEventRepository extends JpaRepository<CashierCloseEvent, Long> {
    Optional<CashierCloseEvent> findByTenantIdAndCommandCodeAndEventType(Long tenantId, String commandCode,
                                                                        String eventType);
}
