package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.WardMedicationReturnRequest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface WardMedicationReturnRequestRepository extends JpaRepository<WardMedicationReturnRequest, Long> {
    Optional<WardMedicationReturnRequest> findByIdAndTenantId(Long id, Long tenantId);
    List<WardMedicationReturnRequest> findByTenantIdAndOrganizationIdOrderByRequestedAtDesc(
            Long tenantId, Long organizationId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from WardMedicationReturnRequest value "
            + "where value.id = :id and value.tenantId = :tenantId")
    Optional<WardMedicationReturnRequest> lockByIdAndTenantId(@Param("id") Long id,
                                                              @Param("tenantId") Long tenantId);
}
