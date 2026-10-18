package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefApplicationLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ReliefApplicationLineRepository extends JpaRepository<ReliefApplicationLine, Long> {
    List<ReliefApplicationLine> findByTenantIdAndApplicationIdIn(Long tenantId, Collection<Long> applicationIds);
}
