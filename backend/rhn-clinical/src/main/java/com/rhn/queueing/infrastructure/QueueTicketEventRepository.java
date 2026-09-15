package com.rhn.queueing.infrastructure;

import com.rhn.queueing.domain.QueueTicketEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface QueueTicketEventRepository extends JpaRepository<QueueTicketEvent, Long> {
    Optional<QueueTicketEvent> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
}
