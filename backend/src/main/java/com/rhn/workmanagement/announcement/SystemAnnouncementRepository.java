package com.rhn.workmanagement.announcement;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

interface SystemAnnouncementRepository extends JpaRepository<SystemAnnouncement, Long> {
    List<SystemAnnouncement> findByTenantIdOrderByCreatedAtDesc(Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from SystemAnnouncement value where value.id = :id and value.tenantId = :tenantId")
    Optional<SystemAnnouncement> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    @Query("""
            select value from SystemAnnouncement value
             where value.tenantId = :tenantId and value.status = 'PUBLISHED'
               and value.publishAt <= :now and (value.expireAt is null or value.expireAt > :now)
               and (value.scopeType = 'TENANT'
                    or (value.scopeType = 'ORGANIZATION' and value.organizationId = :organizationId)
                    or (value.scopeType = 'DEPARTMENT' and value.organizationId = :organizationId
                        and value.departmentId = :departmentId))
             order by value.pinned desc,
               case value.priority when 'URGENT' then 3 when 'IMPORTANT' then 2 else 1 end desc,
               value.publishAt desc
            """)
    List<SystemAnnouncement> findActive(@Param("tenantId") Long tenantId,
                                        @Param("organizationId") Long organizationId,
                                        @Param("departmentId") Long departmentId,
                                        @Param("now") Instant now);

    List<SystemAnnouncement> findTop100ByStatusAndPublishAtLessThanEqualOrderByPublishAtAsc(
            String status, Instant publishAt);
    List<SystemAnnouncement> findTop100ByStatusAndExpireAtLessThanEqualOrderByExpireAtAsc(
            String status, Instant expireAt);
}
