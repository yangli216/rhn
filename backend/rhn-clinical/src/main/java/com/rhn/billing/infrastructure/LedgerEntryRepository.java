package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.LedgerEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, Long> {
 List<LedgerEntry> findByTenantIdAndPaymentIdIn(Long tenant,java.util.Collection<Long> payments);

    Optional<LedgerEntry> findByTenantIdAndChargeItemId(Long tenantId, Long chargeItemId);
    Optional<LedgerEntry> findByTenantIdAndPaymentId(Long tenantId, Long paymentId);
    Optional<LedgerEntry> findByTenantIdAndClaimResponseIdAndEntryType(
            Long tenantId, Long claimResponseId, String entryType);
    boolean existsByTenantIdAndClaimResponseIdAndEntryType(Long tenantId, Long claimResponseId, String entryType);
    List<LedgerEntry> findByTenantIdAndInvoiceIdAndEntryTypeOrderByOccurredAtAscIdAsc(
            Long tenantId, Long invoiceId, String entryType);
    List<LedgerEntry> findByTenantIdAndInvoiceIdInOrderByOccurredAtAscIdAsc(
            Long tenantId, java.util.Collection<Long> invoiceIds);
    List<LedgerEntry> findByTenantIdAndPatientAccountIdOrderByOccurredAtAscIdAsc(Long tenantId, Long accountId);

    @Query("""
            select coalesce(sum(case when e.direction = 'DEBIT' then e.amount else -e.amount end), 0) from LedgerEntry e where e.tenantId = :tenantId and e.patientAccountId = :accountId
            """)
    BigDecimal balance(@Param("tenantId") Long tenantId, @Param("accountId") Long accountId);

    @Query("""
            select e.patientAccountId as accountId,
                   coalesce(sum(case when e.direction = 'DEBIT' then e.amount else -e.amount end), 0) as balance from LedgerEntry e where e.tenantId = :tenantId and e.patientAccountId in :accountIds
             group by e.patientAccountId
            """)
    List<AccountBalance> balances(@Param("tenantId") Long tenantId,
                                  @Param("accountIds") Collection<Long> accountIds);

    /** 结算行对应收费事项在账本中的借方净额（DEBIT 为正、CREDIT 为负），结清平衡校验用。 */
    @Query("""
            select coalesce(sum(case when e.direction = 'DEBIT' then e.amount else -e.amount end), 0)
              from LedgerEntry e
             where e.tenantId = :tenantId
               and e.chargeItemId in (select l.chargeItemId from SettlementLine l
                                       where l.tenantId = :tenantId and l.settlementId = :settlementId)
            """)
    BigDecimal chargeDebitNetForSettlement(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId);

    /** 结算凭证维度账本的贷方净额（CREDIT 为正、DEBIT 为负），含支付、医保、减免、舍入等全部分录类型。 */
    @Query("""
            select coalesce(sum(case when e.direction = 'CREDIT' then e.amount else -e.amount end), 0)
              from LedgerEntry e where e.tenantId = :tenantId and e.invoiceId = :invoiceId
            """)
    BigDecimal creditNetForInvoice(@Param("tenantId") Long tenantId, @Param("invoiceId") Long invoiceId);

    interface AccountBalance {
        Long getAccountId();
        BigDecimal getBalance();
    }

    @Query("""
            select e from LedgerEntry e where e.tenantId = :tenantId and e.patientAccountId in :accountIds
              and e.occurredAt >= :from and e.occurredAt < :to order by e.occurredAt, e.id
            """)
    List<LedgerEntry> findDaily(@Param("tenantId") Long tenantId, @Param("accountIds") List<Long> accountIds,
                                @Param("from") Instant from, @Param("to") Instant to);
}
