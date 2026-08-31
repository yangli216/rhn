package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface InpatientEventRepository extends JpaRepository<InpatientEvent, Long> {
    Optional<InpatientEvent> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
}
