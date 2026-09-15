package com.rhn.analytics.infrastructure;

import com.rhn.analytics.domain.AnalysisDraftVersion;
import org.springframework.data.repository.Repository;
import java.util.Optional;

/** Internal storage: every read must carry a tenant; object authorization comes in A08. */
public interface AnalysisDraftVersionRepository extends Repository<AnalysisDraftVersion, Long> {
    java.util.List<AnalysisDraftVersion> findTop50ByTenantIdAndOwnerIdOrderByCreatedAtDesc(Long tenantId, Long ownerId);
    AnalysisDraftVersion save(AnalysisDraftVersion value);
    Optional<AnalysisDraftVersion> findByIdAndTenantId(Long id, Long tenantId);
}
