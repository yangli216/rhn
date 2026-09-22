package com.rhn.platform.masterdata.infrastructure;
import com.rhn.platform.masterdata.domain.MedicationStandardSource;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface MedicationStandardSourceRepository extends JpaRepository<MedicationStandardSource, Long> {
    java.util.List<MedicationStandardSource> findByTenantId(Long tenantId);
    java.util.List<MedicationStandardSource> findByTenantIdAndMedicationId(Long tenantId, Long medicationId);
    Optional<MedicationStandardSource> findByTenantIdAndCatalogCodeAndCatalogVersionAndSpecificationCode(
            Long tenantId, String catalogCode, String catalogVersion, String specificationCode);
}
