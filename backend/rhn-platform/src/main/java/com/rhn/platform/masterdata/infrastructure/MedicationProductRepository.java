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
    @Query("select p from MedicationProduct p where p.itemType = 'MED_PRODUCT'")
    List<MedicationProduct> findAllProducts();

    @Query("select p from MedicationProduct p where p.itemType = 'MED_PRODUCT'")
    Page<MedicationProduct> findAllProducts(Pageable pageable);

    @Query("""
            select p from MedicationProduct p
            where p.itemType = 'MED_PRODUCT' and (p.validFrom = :effectiveFrom or p.validTo = :effectiveTo)
            """)
    Page<MedicationProduct> findSearchProjectionTransitions(
            @Param("effectiveFrom") java.time.LocalDate effectiveFrom,
            @Param("effectiveTo") java.time.LocalDate effectiveTo,
            Pageable pageable);

    List<MedicationProduct> findByTenantIdAndItemTypeOrderByName(Long tenantId, String itemType);
    List<MedicationProduct> findByTenantIdAndMedicationIdIn(Long tenantId, Collection<Long> medicationIds);
    List<MedicationProduct> findByTenantIdAndIdIn(Long tenantId, Collection<Long> ids);
    Optional<MedicationProduct> findByIdAndTenantIdAndItemType(Long id, Long tenantId, String itemType);
    boolean existsByTenantIdAndCode(Long tenantId, String code);

    boolean existsByTenantIdAndMedicationId(Long tenantId, Long medicationId);

    @Query("""
            select p from MedicationProduct p join Medication m on m.id = p.medicationId and m.tenantId = p.tenantId
            join Manufacturer f on f.id = p.manufacturerId and f.tenantId = p.tenantId
            where p.tenantId = :tenantId and p.itemType = 'MED_PRODUCT'
              and (:stockable = false or (
                m.status = 'ACTIVE' and p.stocked = true and p.validFrom <= :at and (p.validTo is null or p.validTo >= :at)
                and exists (select pkg.id from ItemPackage pkg where pkg.tenantId = p.tenantId and pkg.catalogItemId = p.id
                    and pkg.status = 'ACTIVE' and pkg.validFrom <= :at and (pkg.validTo is null or pkg.validTo >= :at))
                and exists (select a.id from OrganizationCatalogItem a where a.tenantId = p.tenantId and a.catalogItemId = p.id
                    and a.status = 'ACTIVE' and a.stocked = true and (:dispensable = false or a.dispensable = true)
                    and a.validFrom <= :at and (a.validTo is null or a.validTo >= :at)
                    and (a.organizationId = :organizationId or (a.organizationId = :sourceOrganizationId
                        and not exists (select local.id from OrganizationCatalogItem local
                            where local.tenantId = p.tenantId and local.catalogItemId = p.id and local.organizationId = :organizationId
                            and local.validFrom <= :at and (local.validTo is null or local.validTo >= :at))))
                    and not exists (select newer.id from OrganizationCatalogItem newer
                        where newer.tenantId = a.tenantId and newer.catalogItemId = a.catalogItemId and newer.organizationId = a.organizationId
                        and newer.validFrom > a.validFrom and newer.validFrom <= :at and (newer.validTo is null or newer.validTo >= :at)))
              ))
              and (:medicationType is null or :medicationType = '' or m.medicationType = :medicationType)
              and (:status is null or :status = '' or p.status = :status)
              and (:query is null or :query = ''
                or lower(p.code) like lower(concat(:query, '%'))
                or lower(coalesce(p.approvalCode, '')) like lower(concat(:query, '%'))
                or lower(f.name) like lower(concat('%', :query, '%'))
                or lower(m.code) like lower(concat(:query, '%'))
                or p.id in :productSearchIds or m.id in :medicationSearchIds)
            """)
    Page<MedicationProduct> searchProducts(@Param("tenantId") Long tenantId, @Param("query") String query,
            @Param("medicationType") String medicationType, @Param("status") String status,
            @Param("productSearchIds") Collection<Long> productSearchIds,
            @Param("medicationSearchIds") Collection<Long> medicationSearchIds,
            @Param("stockable") boolean stockable, @Param("dispensable") boolean dispensable,
            @Param("organizationId") Long organizationId, @Param("sourceOrganizationId") Long sourceOrganizationId,
            @Param("at") java.time.LocalDate at, Pageable pageable);

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
