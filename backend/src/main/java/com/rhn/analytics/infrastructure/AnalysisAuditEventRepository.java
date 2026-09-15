package com.rhn.analytics.infrastructure;

import com.rhn.analytics.domain.AnalysisAuditEvent;
import org.springframework.data.repository.Repository;
import java.util.Optional;

/** Internal storage: every read must carry a tenant; object authorization comes in A08. */
public interface AnalysisAuditEventRepository extends Repository<AnalysisAuditEvent, Long> {
    AnalysisAuditEvent save(AnalysisAuditEvent value);
    Optional<AnalysisAuditEvent> findByIdAndTenantId(Long id, Long tenantId);
}
