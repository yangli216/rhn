package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.WardDeliveryEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface WardDeliveryEventRepository extends JpaRepository<WardDeliveryEvent, Long> {
    Optional<WardDeliveryEvent> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
    List<WardDeliveryEvent> findByTenantIdAndDeliveryIdInOrderByOccurredAtAscIdAsc(
            Long tenantId, Collection<Long> deliveryIds);
}
