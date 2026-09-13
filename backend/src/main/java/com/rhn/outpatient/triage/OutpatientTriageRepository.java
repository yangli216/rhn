package com.rhn.outpatient.triage;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface OutpatientTriageRepository extends JpaRepository<OutpatientTriageRecord, Long> {

    Optional<OutpatientTriageRecord> findByTenantIdAndId(Long tenantId, Long id);

    Optional<OutpatientTriageRecord> findByTenantIdAndTriageNo(Long tenantId, String triageNo);

    Optional<OutpatientTriageRecord> findTopByTenantIdAndEncounterIdOrderByTriageTimeDesc(Long tenantId, Long encounterId);

    List<OutpatientTriageRecord> findByTenantIdAndEncounterIdInAndTriageTimeBetween(
            Long tenantId, Collection<Long> encounterIds, Instant fromTime, Instant toTime);

    List<OutpatientTriageRecord> findByTenantIdAndResidentIdOrderByTriageTimeDesc(Long tenantId, Long residentId);

    @Query("select t from OutpatientTriageRecord t where t.tenantId = :tenantId and t.organizationId = :orgId " +
           "and t.triageTime >= :fromTime and t.triageTime <= :toTime " +
           "and (:triageLevel is null or t.triageLevel = :triageLevel) " +
           "and (:status is null or t.status = :status) " +
           "and (:query is null or lower(t.patientName) like lower(concat('%', :query, '%')) " +
           "     or t.phone like concat('%', :query, '%') or t.triageNo like concat('%', :query, '%') " +
           "     or t.idCardNo like concat('%', :query, '%')) " +
           "order by t.triageTime desc")
    Page<OutpatientTriageRecord> searchTriageRecords(
            @Param("tenantId") Long tenantId,
            @Param("orgId") Long organizationId,
            @Param("fromTime") Instant fromTime,
            @Param("toTime") Instant toTime,
            @Param("triageLevel") String triageLevel,
            @Param("status") String status,
            @Param("query") String query,
            Pageable pageable);

    @Query("select t from OutpatientTriageRecord t where t.tenantId = :tenantId and t.organizationId = :orgId " +
           "and t.triageTime >= :fromTime and t.triageTime <= :toTime")
    List<OutpatientTriageRecord> findTodayRecords(
            @Param("tenantId") Long tenantId,
            @Param("orgId") Long organizationId,
            @Param("fromTime") Instant fromTime,
            @Param("toTime") Instant toTime);
}
