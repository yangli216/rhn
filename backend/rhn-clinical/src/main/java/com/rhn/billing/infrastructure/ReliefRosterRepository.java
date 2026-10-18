package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefRosterEntry;
import com.rhn.billing.domain.ReliefRosterStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ReliefRosterRepository extends JpaRepository<ReliefRosterEntry, Long> {
    Optional<ReliefRosterEntry> findByIdAndTenantId(Long id, Long tenantId);
    List<ReliefRosterEntry> findByTenantIdAndResidentIdAndStatus(Long tenantId, Long residentId, ReliefRosterStatus status);
    List<ReliefRosterEntry> findByTenantIdAndResidentIdAndQualificationTypeAndStatus(
            Long tenantId, Long residentId, String qualificationType, ReliefRosterStatus status);
    boolean existsByTenantIdAndImportBatch(Long tenantId, String importBatch);

    @Query("""
            select value from ReliefRosterEntry value
            where value.tenantId = :tenantId
              and (:qualificationType is null or value.qualificationType = :qualificationType)
              and (:residentId is null or value.residentId = :residentId)
              and (:status is null or value.status = :status)
              and (:importBatch is null or value.importBatch = :importBatch)
            order by value.updatedAt desc, value.id desc
            """)
    List<ReliefRosterEntry> search(@Param("tenantId") Long tenantId, @Param("qualificationType") String qualificationType,
                                   @Param("residentId") Long residentId, @Param("status") ReliefRosterStatus status,
                                   @Param("importBatch") String importBatch, Pageable pageable);
}
