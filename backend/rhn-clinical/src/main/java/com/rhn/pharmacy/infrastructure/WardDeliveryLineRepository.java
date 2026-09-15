package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.WardDeliveryLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface WardDeliveryLineRepository extends JpaRepository<WardDeliveryLine, Long> {
    List<WardDeliveryLine> findByTenantIdAndDeliveryIdOrderById(Long tenantId, Long deliveryId);
    List<WardDeliveryLine> findByTenantIdAndDeliveryIdInOrderByDeliveryIdAscIdAsc(
            Long tenantId, Collection<Long> deliveryIds);
    boolean existsByTenantIdAndDispenseId(Long tenantId, Long dispenseId);
    Optional<WardDeliveryLine> findByTenantIdAndDispenseId(Long tenantId, Long dispenseId);
}
