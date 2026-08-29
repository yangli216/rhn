package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.PatientAccount;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PatientAccountRepository extends JpaRepository<PatientAccount, Long> {
    Optional<PatientAccount> findByTenantIdAndEncounterIdAndCurrencyCode(Long tenantId, Long encounterId,
                                                                         String currencyCode);
    Optional<PatientAccount> findByIdAndTenantId(Long id, Long tenantId);
    List<PatientAccount> findByTenantIdAndOrganizationId(Long tenantId, Long organizationId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from PatientAccount a where a.id = :id and a.tenantId = :tenantId")
    Optional<PatientAccount> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
