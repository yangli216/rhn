package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.Receipt;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

public interface ReceiptRepository extends JpaRepository<Receipt, Long> {
    Optional<Receipt> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Receipt> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
    Optional<Receipt> findByTenantIdAndReceiptNo(Long tenantId, String receiptNo);
    Optional<Receipt> findByTenantIdAndReversesReceiptId(Long tenantId, Long reversesReceiptId);
    List<Receipt> findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(Long tenantId, Long settlementId);
    @Query("""
            select receipt from Receipt receipt, Settlement settlement, PatientAccount account
             where receipt.tenantId = :tenantId and receipt.status in :statuses
               and settlement.id = receipt.settlementId and settlement.tenantId = receipt.tenantId
               and account.id = settlement.patientAccountId and account.tenantId = receipt.tenantId
               and account.organizationId = :organizationId and account.departmentId = :departmentId
             order by receipt.updatedAt, receipt.id
            """)
    List<Receipt> findRecoveryWorklist(@Param("tenantId") Long tenantId,
                                       @Param("organizationId") Long organizationId,
                                       @Param("departmentId") Long departmentId,
                                       @Param("statuses") List<String> statuses,
                                       Pageable pageable);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from Receipt value where value.id = :id and value.tenantId = :tenantId")
    Optional<Receipt> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
