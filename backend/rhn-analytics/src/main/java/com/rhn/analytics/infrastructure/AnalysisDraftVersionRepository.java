package com.rhn.analytics.infrastructure;

import com.rhn.analytics.domain.AnalysisDraftVersion;
import org.springframework.data.repository.Repository;
import java.util.Optional;

/** Internal storage: every read must carry a tenant; object authorization comes in A08. */
public interface AnalysisDraftVersionRepository extends Repository<AnalysisDraftVersion, Long> {
    java.util.List<AnalysisDraftVersion> findTop50ByTenantIdAndOwnerIdOrderByCreatedAtDesc(Long tenantId, Long ownerId);
    java.util.List<AnalysisDraftVersion> findByTenantIdAndOwnerIdOrderByCreatedAtDesc(Long tenantId, Long ownerId);
    java.util.List<AnalysisDraftVersion> findByTenantIdAndOwnerIdAndDraftIdOrderByDraftVersionDesc(Long tenantId, Long ownerId, Long draftId);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select v from AnalysisDraftVersion v where v.tenantId = :tenantId and v.ownerId = :ownerId and v.draftId = :draftId and v.draftVersion = 1")
    Optional<AnalysisDraftVersion> lockRoot(Long tenantId, Long ownerId, Long draftId);
    AnalysisDraftVersion save(AnalysisDraftVersion value);
    Optional<AnalysisDraftVersion> findByIdAndTenantId(Long id, Long tenantId);
}
