package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.CareEpisode;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CareEpisodeRepository extends JpaRepository<CareEpisode, Long> {
    List<CareEpisode> findByTenantIdAndOrganizationIdAndEpisodeTypeAndStatusInOrderByStartAtDesc(
            Long tenantId, Long organizationId, String episodeType, Collection<String> statuses);
    boolean existsByTenantIdAndResidentIdAndEpisodeTypeAndStatusIn(
            Long tenantId, Long residentId, String episodeType, Collection<String> statuses);
    Optional<CareEpisode> findByIdAndTenantId(Long id, Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from CareEpisode value where value.tenantId = :tenantId and value.id = :episodeId")
    Optional<CareEpisode> findLocked(@Param("tenantId") Long tenantId, @Param("episodeId") Long episodeId);
}
