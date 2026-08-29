package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.DispenseTaskLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DispenseTaskLineRepository extends JpaRepository<DispenseTaskLine, Long> {
    Optional<DispenseTaskLine> findByTenantIdAndRequestId(Long tenantId, Long requestId);
    Optional<DispenseTaskLine> findByTenantIdAndTaskId(Long tenantId, Long taskId);
    List<DispenseTaskLine> findByTenantIdAndTaskIdOrderById(Long tenantId, Long taskId);
}
