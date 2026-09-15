package com.rhn.platform.realtime.application;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

interface PresenceMetricSampleRepository extends JpaRepository<PresenceMetricSample, Long> {
    boolean existsByTenantIdAndScopeKeyAndBucketAt(Long tenantId, String scopeKey, Instant bucketAt);

    @Query("""
            select value from PresenceMetricSample value
             where value.tenantId = :tenantId and value.scopeKey = :scopeKey
               and value.bucketAt >= :from and value.bucketAt <= :to
             order by value.bucketAt
            """)
    List<PresenceMetricSample> findRange(@Param("tenantId") Long tenantId, @Param("scopeKey") String scopeKey,
                                         @Param("from") Instant from, @Param("to") Instant to);

    @Modifying
    @Query("delete from PresenceMetricSample value where value.bucketAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);
}
