package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.SettlementTender;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface SettlementTenderRepository extends JpaRepository<SettlementTender, Long> {
    Optional<SettlementTender> findByTenantIdAndPaymentId(Long tenantId, Long paymentId);
    List<SettlementTender> findByTenantIdAndSettlementIdOrderByLineNoAsc(Long tenantId, Long settlementId);
    List<SettlementTender> findByTenantIdAndSettlementIdInOrderBySettlementIdAscLineNoAsc(
            Long tenantId, java.util.Collection<Long> settlementIds);
    long countByTenantIdAndSettlementId(Long tenantId, Long settlementId);
    boolean existsByTenantIdAndClaimResponseIdAndTenderType(Long tenantId, Long claimResponseId, String tenderType);
    boolean existsByTenantIdAndClaimResponseId(Long tenantId, Long claimResponseId);
    @Query("select coalesce(sum(value.tenderAmount), 0) from SettlementTender value where value.tenantId = :tenantId and value.settlementId = :settlementId")
    BigDecimal totalTendered(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId);
    @Query("select value.settlementId as settlementId, coalesce(sum(value.tenderAmount), 0) as tenderedAmount "
            + "from SettlementTender value where value.tenantId = :tenantId and value.settlementId in :settlementIds "
            + "group by value.settlementId")
    List<SettlementTenderedAmount> totalTenderedBySettlementIds(
            @Param("tenantId") Long tenantId, @Param("settlementIds") java.util.Collection<Long> settlementIds);

    interface SettlementTenderedAmount {
        Long getSettlementId();
        BigDecimal getTenderedAmount();
    }
    @Query("select coalesce(sum(value.tenderAmount), 0) from SettlementTender value where value.tenantId = :tenantId and value.settlementId = :settlementId and (value.paymentId is null or value.tenderType = 'PREPAYMENT')")
    BigDecimal nonPaymentTendered(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId);
    /** 住院预交金冲抵：对应存款分录不带结算凭证，结清平衡校验按冲抵的 tender 金额计入凭证贷方。 */
    @Query("select coalesce(sum(value.tenderAmount), 0) from SettlementTender value where value.tenantId = :tenantId and value.settlementId = :settlementId and value.tenderType = 'PREPAYMENT'")
    BigDecimal prepaymentTendered(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId);
}
