package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.Settlement;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SettlementRepository extends JpaRepository<Settlement, Long> {
    Optional<Settlement> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Settlement> findByTenantIdAndLegacyInvoiceId(Long tenantId, Long legacyInvoiceId);
    Optional<Settlement> findByTenantIdAndSettlementNo(Long tenantId, String settlementNo);
    List<Settlement> findByTenantIdAndPatientAccountIdOrderByCreatedAtAscIdAsc(Long tenantId, Long patientAccountId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from Settlement value where value.id = :id and value.tenantId = :tenantId")
    Optional<Settlement> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
