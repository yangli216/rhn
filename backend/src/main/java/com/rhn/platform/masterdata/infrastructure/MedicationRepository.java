package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.Medication;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MedicationRepository extends JpaRepository<Medication, Long> {
    List<Medication> findByTenantIdOrderByName(Long tenantId);
    Optional<Medication> findByIdAndTenantId(Long id, Long tenantId);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
}
