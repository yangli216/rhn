package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientOrderEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface InpatientOrderEventRepository extends JpaRepository<InpatientOrderEvent, Long> {
    Optional<InpatientOrderEvent> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
}
