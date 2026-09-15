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
    long countByTenantIdAndSettlementId(Long tenantId, Long settlementId);
    boolean existsByTenantIdAndClaimResponseIdAndTenderType(Long tenantId, Long claimResponseId, String tenderType);
    boolean existsByTenantIdAndClaimResponseId(Long tenantId, Long claimResponseId);
    @Query("select coalesce(sum(value.tenderAmount), 0) from SettlementTender value where value.tenantId = :tenantId and value.settlementId = :settlementId")
    BigDecimal totalTendered(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId);
    @Query("select coalesce(sum(value.tenderAmount), 0) from SettlementTender value where value.tenantId = :tenantId and value.settlementId = :settlementId and (value.paymentId is null or value.tenderType = 'PREPAYMENT')")
    BigDecimal nonPaymentTendered(@Param("tenantId") Long tenantId, @Param("settlementId") Long settlementId);
}
