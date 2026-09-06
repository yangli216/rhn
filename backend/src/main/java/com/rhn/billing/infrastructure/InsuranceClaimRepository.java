package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.InsuranceClaim;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

public interface InsuranceClaimRepository extends JpaRepository<InsuranceClaim, Long> {
    Optional<InsuranceClaim> findByIdAndTenantId(Long id, Long tenantId);
    Optional<InsuranceClaim> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
    Optional<InsuranceClaim> findByTenantIdAndSettlementId(Long tenantId, Long settlementId);
    Optional<InsuranceClaim> findByTenantIdAndClaimNo(Long tenantId, String claimNo);
    @Query("""
            select value from InsuranceClaim value, PatientAccount account
             where value.tenantId = :tenantId and value.status in :statuses
               and account.id = value.patientAccountId and account.tenantId = value.tenantId
               and account.organizationId = :organizationId
             order by value.updatedAt, value.id
            """)
    List<InsuranceClaim> findRecoveryWorklist(@Param("tenantId") Long tenantId,
                                              @Param("organizationId") Long organizationId,
                                              @Param("statuses") List<String> statuses,
                                              Pageable pageable);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InsuranceClaim value where value.id = :id and value.tenantId = :tenantId")
    Optional<InsuranceClaim> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
