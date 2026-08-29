package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.RegistrationBillingIntent;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface RegistrationBillingIntentRepository extends JpaRepository<RegistrationBillingIntent, Long> {
    Optional<RegistrationBillingIntent> findByIdAndTenantId(Long id, Long tenantId);
    Optional<RegistrationBillingIntent> findByTenantIdAndIdempotencyCode(Long tenantId, String idempotencyCode);
    Optional<RegistrationBillingIntent> findByTenantIdAndSettlementId(Long tenantId, Long settlementId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from RegistrationBillingIntent value where value.id = :id and value.tenantId = :tenantId")
    Optional<RegistrationBillingIntent> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
