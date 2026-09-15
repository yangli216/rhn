package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.MedicationProduct;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MedicationProductRepository extends JpaRepository<MedicationProduct, Long> {
    List<MedicationProduct> findByTenantIdAndItemTypeOrderByName(Long tenantId, String itemType);
    List<MedicationProduct> findByTenantIdAndMedicationIdIn(Long tenantId, Collection<Long> medicationIds);
    List<MedicationProduct> findByTenantIdAndIdIn(Long tenantId, Collection<Long> ids);
    Optional<MedicationProduct> findByIdAndTenantIdAndItemType(Long id, Long tenantId, String itemType);
    boolean existsByTenantIdAndCode(Long tenantId, String code);

    @Query("""
            select p from MedicationProduct p
            where p.tenantId = :tenantId and p.itemType = 'MED_PRODUCT'
              and (:status is null or :status = '' or p.status = :status)
              and (:query is null or :query = '' or lower(p.code) like lower(concat('%', :query, '%'))
                   or lower(p.name) like lower(concat('%', :query, '%'))
                   or lower(coalesce(p.tradeName, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(p.approvalCode, '')) like lower(concat('%', :query, '%')))
            """)
    Page<MedicationProduct> search(@Param("tenantId") Long tenantId, @Param("query") String query,
                                   @Param("status") String status, Pageable pageable);
}
