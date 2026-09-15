package com.rhn.analytics.infrastructure;

import com.rhn.analytics.domain.AnalysisRun;
import org.springframework.data.repository.Repository;
import java.util.Optional;

/** Internal storage: every read must carry a tenant; object authorization comes in A08. */
public interface AnalysisRunRepository extends Repository<AnalysisRun, Long> {
    AnalysisRun save(AnalysisRun value);
    Optional<AnalysisRun> findByIdAndTenantId(Long id, Long tenantId);
}
