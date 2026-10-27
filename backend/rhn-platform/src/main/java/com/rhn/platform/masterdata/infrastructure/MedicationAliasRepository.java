package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.MedicationAlias;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface MedicationAliasRepository extends JpaRepository<MedicationAlias, Long> {
    List<MedicationAlias> findByTenantIdAndMedicationIdOrderByAliasName(Long tenantId, Long medicationId);

    List<MedicationAlias> findByTenantIdAndMedicationIdAndStatusOrderByAliasName(
            Long tenantId, Long medicationId, String status);

    List<MedicationAlias> findByTenantIdAndStatusOrderByAliasName(Long tenantId, String status);

    List<MedicationAlias> findByTenantIdAndMedicationIdInAndStatusOrderByAliasName(
            Long tenantId, Collection<Long> medicationIds, String status);
}
