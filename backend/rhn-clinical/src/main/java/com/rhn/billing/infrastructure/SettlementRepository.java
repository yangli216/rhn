package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SettlementRepository extends JpaRepository<Settlement, Long> {
    Optional<Settlement> findByIdAndTenantId(Long id, Long tenantId);
    List<Settlement> findByTenantIdAndIdIn(Long tenantId, java.util.Collection<Long> ids);
    Optional<Settlement> findByTenantIdAndLegacyInvoiceId(Long tenantId, Long legacyInvoiceId);
    List<Settlement> findByTenantIdAndLegacyInvoiceIdIn(Long tenantId, java.util.Collection<Long> legacyInvoiceIds);
    Optional<Settlement> findByTenantIdAndOrganizationIdAndSettlementNo(Long tenantId, Long organizationId, String settlementNo);
    List<Settlement> findByTenantIdAndPatientAccountIdOrderByCreatedAtAscIdAsc(Long tenantId, Long patientAccountId);

    @Query("""
            select value from Settlement value
            where value.tenantId = :tenantId and value.status = :status
              and exists (select account.id from PatientAccount account
                          where account.id = value.patientAccountId and account.tenantId = :tenantId
                            and account.organizationId = :organizationId)
            order by value.finalizedAt desc, value.createdAt desc, value.id desc
            """)
    List<Settlement> findRecentCompleted(@Param("tenantId") Long tenantId,
                                         @Param("organizationId") Long organizationId,
                                         @Param("status") SettlementStatus status,
                                         Pageable pageable);

    @Query("""
            select value from Settlement value
            where value.tenantId = :tenantId and value.status in :statuses
              and coalesce(value.finalizedAt, value.createdAt) >= :from
              and coalesce(value.finalizedAt, value.createdAt) < :to
              and (:filterCashier = false or value.finalizedBy in :cashierIds)
              and (:filterScene = false or value.terminalScene = :terminalScene)
              and exists (select account.id from PatientAccount account
                          where account.id = value.patientAccountId and account.tenantId = :tenantId
                            and account.organizationId = :organizationId)
            order by value.finalizedAt desc, value.createdAt desc, value.id desc
            """)
    List<Settlement> findCompletedInRange(Long tenantId, Long organizationId, java.util.Collection<SettlementStatus> statuses,
            java.time.Instant from, java.time.Instant to, boolean filterCashier, java.util.Collection<Long> cashierIds,
            boolean filterScene, String terminalScene, Pageable pageable);

    @Query("""
            select distinct value.finalizedBy from Settlement value
            where value.tenantId = :tenantId and value.status = :status and value.finalizedBy is not null
              and coalesce(value.finalizedAt, value.createdAt) >= :from
              and coalesce(value.finalizedAt, value.createdAt) < :to
              and value.organizationId = :organizationId
            """)
    List<Long> findFinalizersInRange(Long tenantId, Long organizationId, SettlementStatus status,
            java.time.Instant from, java.time.Instant to);

    /** Rows of (finalizer, entry terminal scene) that actually settled in the range, used to build the operator filter. */
    @Query("""
            select distinct value.finalizedBy, value.terminalScene from Settlement value
            where value.tenantId = :tenantId and value.status = :status and value.finalizedBy is not null
              and coalesce(value.finalizedAt, value.createdAt) >= :from
              and coalesce(value.finalizedAt, value.createdAt) < :to
              and value.organizationId = :organizationId
            """)
    List<Object[]> findFinalizerScenesInRange(Long tenantId, Long organizationId, SettlementStatus status,
            java.time.Instant from, java.time.Instant to);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from Settlement value where value.id = :id and value.tenantId = :tenantId")
    Optional<Settlement> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    /** 尚未收款完成的正常结算单（异常结算扫描用）：按创建时间从早到晚。 */
    @Query("""
            select value from Settlement value
            where value.tenantId = :tenantId and value.settlementType = 'NORMAL' and value.status in :statuses
              and value.createdAt >= :since
              and exists (select account.id from PatientAccount account
                          where account.id = value.patientAccountId and account.tenantId = :tenantId
                            and account.organizationId = :organizationId)
            order by value.createdAt, value.id
            """)
    List<Settlement> findOpenSince(Long tenantId, Long organizationId, java.util.Collection<SettlementStatus> statuses,
            java.time.Instant since, Pageable pageable);
}
