package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientOrderWorkflow;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface InpatientOrderWorkflowRepository extends JpaRepository<InpatientOrderWorkflow, Long> {
    Optional<InpatientOrderWorkflow> findByRequestIdAndTenantId(Long requestId, Long tenantId);

    List<InpatientOrderWorkflow> findByTenantIdOrderByUpdatedAtDesc(Long tenantId);

    List<InpatientOrderWorkflow> findByTenantIdAndEpisodeIdOrderByUpdatedAtDesc(Long tenantId, Long episodeId);

    List<InpatientOrderWorkflow> findByTenantIdAndEpisodeIdInOrderByUpdatedAtDesc(
            Long tenantId, Collection<Long> episodeIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientOrderWorkflow value where value.tenantId = :tenantId "
            + "and value.requestId = :requestId")
    Optional<InpatientOrderWorkflow> findLocked(@Param("tenantId") Long tenantId,
                                                 @Param("requestId") Long requestId);
}
