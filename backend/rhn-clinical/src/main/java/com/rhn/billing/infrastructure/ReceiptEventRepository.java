package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReceiptEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ReceiptEventRepository extends JpaRepository<ReceiptEvent, Long> {
    Optional<ReceiptEvent> findByTenantIdAndReceiptIdAndCommandCode(Long tenantId, Long receiptId, String commandCode);
    List<ReceiptEvent> findByTenantIdAndReceiptIdOrderByOccurredAtAscIdAsc(Long tenantId, Long receiptId);
}
