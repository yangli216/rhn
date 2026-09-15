package com.rhn.analytics.infrastructure;

import com.rhn.analytics.domain.AnalyticsCatalogVersion;
import org.springframework.data.repository.Repository;
import java.util.Optional;

/** Internal storage: every read must carry a tenant; object authorization comes in A08. */
public interface AnalyticsCatalogVersionRepository extends Repository<AnalyticsCatalogVersion, Long> {
    Optional<AnalyticsCatalogVersion> findByTenantIdAndCodeAndCatalogVersion(Long tenantId, String code, int catalogVersion);
    AnalyticsCatalogVersion save(AnalyticsCatalogVersion value);
    Optional<AnalyticsCatalogVersion> findByIdAndTenantId(Long id, Long tenantId);
}
