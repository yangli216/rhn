package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.PatientAccount;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface PatientAccountRepository extends JpaRepository<PatientAccount, Long> {
    Optional<PatientAccount> findByTenantIdAndEncounterIdAndCurrencyCode(Long tenantId, Long encounterId,
                                                                         String currencyCode);
    Optional<PatientAccount> findByIdAndTenantId(Long id, Long tenantId);
    List<PatientAccount> findTop200ByTenantIdAndOrganizationIdAndEncounterIdIsNotNullOrderByOpenedAtDesc(
            Long tenantId, Long organizationId);
    List<PatientAccount> findByTenantIdAndOrganizationIdAndEncounterIdIsNotNullAndOpenedAtGreaterThanEqualAndOpenedAtLessThanOrderByOpenedAtDesc(
            Long tenantId, Long organizationId, java.time.Instant from, java.time.Instant to);
    long countByTenantIdAndOrganizationIdAndAccountTypeAndEncounterIdIsNotNullAndOpenedAtGreaterThanEqualAndOpenedAtLessThan(
            Long tenantId, Long organizationId, String accountType,
            java.time.Instant from, java.time.Instant to);
    List<PatientAccount> findByTenantIdAndEncounterIdIn(Long tenantId, Collection<Long> encounterIds);
    List<PatientAccount> findByTenantIdAndIdIn(Long tenantId, Collection<Long> accountIds);

    /** 机构下在用币种（仅取去重值），避免为取币种装载全部账户。 */
    @Query("""
            select distinct a.currencyCode from PatientAccount a
             where a.tenantId = :tenantId and a.organizationId = :organizationId
            """)
    List<String> findCurrencyCodesByOrganization(@Param("tenantId") Long tenantId,
                                                 @Param("organizationId") Long organizationId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from PatientAccount a where a.id = :id and a.tenantId = :tenantId")
    Optional<PatientAccount> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
