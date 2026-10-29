package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ChargeItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ChargeItemRepository extends JpaRepository<ChargeItem, Long> {
    /** 单行来源（挂号、发退药、住院任务等）的收费事项；检查申请可能多行，须用按行号排序的列表查询。 */
    Optional<ChargeItem> findByTenantIdAndSourceTypeAndSourceId(Long tenantId, String sourceType, Long sourceId);
    List<ChargeItem> findByTenantIdAndSourceTypeAndSourceIdOrderByChargeLineNoAsc(Long tenantId, String sourceType,
                                                                                 Long sourceId);
    Optional<ChargeItem> findByIdAndTenantId(Long id, Long tenantId);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from ChargeItem c where c.id = :id and c.tenantId = :tenantId")
    Optional<ChargeItem> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<ChargeItem> findByTenantIdAndIdIn(Long tenantId, Collection<Long> ids);
    List<ChargeItem> findByTenantIdAndReversesChargeItemIdIn(Long tenantId, Collection<Long> reversedChargeItemIds);
    List<ChargeItem> findByTenantIdAndReversesChargeItemIdOrderByOccurredAtAscIdAsc(Long tenantId,
                                                                                     Long reversesChargeItemId);
    List<ChargeItem> findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(Long tenantId, Long accountId);
    List<ChargeItem> findByTenantIdAndEncounterIdOrderByOccurredAtAscIdAsc(Long tenantId, Long encounterId);
    List<ChargeItem> findByTenantIdAndPatientAccountIdInOrderByOccurredAtDescIdDesc(
            Long tenantId, Collection<Long> accountIds);

    @Query("""
            select c from ChargeItem c where c.tenantId = :tenantId and c.patientAccountId = :accountId
              and not exists (select l.id from InvoiceLine l where l.tenantId = c.tenantId and l.chargeItemId = c.id)
            order by c.occurredAt, c.id
            """)
    List<ChargeItem> findUninvoiced(@Param("tenantId") Long tenantId, @Param("accountId") Long accountId);

    @Query("""
            select c from ChargeItem c where c.tenantId = :tenantId and c.patientAccountId in :accountIds
              and not exists (select l.id from InvoiceLine l where l.tenantId = c.tenantId and l.chargeItemId = c.id)
            """)
    List<ChargeItem> findUninvoiced(@Param("tenantId") Long tenantId,
                                    @Param("accountIds") Collection<Long> accountIds);

    List<ChargeItem> findByTenantIdAndSourceTypeAndSourceIdIn(Long tenantId, String sourceType,
                                                              Collection<Long> sourceIds);

    @Query("""
            select c from ChargeItem c where c.tenantId = :tenantId
              and c.occurredAt >= :from and c.occurredAt < :to
              and c.patientAccountId in (select a.id from PatientAccount a
                    where a.tenantId = :tenantId and a.organizationId = :organizationId)
            order by c.occurredAt, c.id
            """)
    List<ChargeItem> findDailyByOrganization(@Param("tenantId") Long tenantId,
                                             @Param("organizationId") Long organizationId,
                                             @Param("from") Instant from, @Param("to") Instant to);

    @Query("""
            select c from ChargeItem c where c.tenantId = :tenantId and c.patientAccountId in :accountIds
              and c.occurredAt >= :from and c.occurredAt < :to order by c.occurredAt, c.id
            """)
    List<ChargeItem> findDaily(@Param("tenantId") Long tenantId, @Param("accountIds") List<Long> accountIds,
                               @Param("from") Instant from, @Param("to") Instant to);

    /** 列表装配用的轻量收费行投影，避免为判定状态装载完整收费实体。 */
    interface ChargeBillingRow {
        Long getId();
        Long getPatientAccountId();
        String getSourceType();
        Long getSourceId();
        Long getRequestId();
        Instant getOccurredAt();
        String getRequestCode();
        java.math.BigDecimal getTotalAmount();
    }

    @Query("""
            select c.id as id, c.patientAccountId as patientAccountId, c.sourceType as sourceType,
                   c.sourceId as sourceId, c.requestId as requestId, c.occurredAt as occurredAt,
                   c.requestCode as requestCode, c.totalAmount as totalAmount
            from ChargeItem c where c.tenantId = :tenantId and c.patientAccountId in :accountIds
            order by c.occurredAt desc, c.id desc
            """)
    List<ChargeBillingRow> findBillingRows(@Param("tenantId") Long tenantId,
                                           @Param("accountIds") Collection<Long> accountIds);

    @Query("""
            select c.id from ChargeItem c where c.tenantId = :tenantId and c.patientAccountId in :accountIds
              and not exists (select l.id from InvoiceLine l where l.tenantId = c.tenantId and l.chargeItemId = c.id)
            """)
    List<Long> findUninvoicedIds(@Param("tenantId") Long tenantId,
                                 @Param("accountIds") Collection<Long> accountIds);
}
