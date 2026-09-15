package com.rhn.platform.eventing.infrastructure;

import com.rhn.platform.eventing.domain.EventConsumption;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventConsumptionRepository extends JpaRepository<EventConsumption, Long> {
    boolean existsByConsumerNameAndEventId(String consumerName, Long eventId);
}
