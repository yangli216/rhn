package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.ServiceCatalogItem;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ServiceCatalogItemRepository extends JpaRepository<ServiceCatalogItem, Long> {
    @Query("select s from ServiceCatalogItem s where s.itemType = 'SERVICE'")
    List<ServiceCatalogItem> findAllServices();

    @Query("select s from ServiceCatalogItem s where s.itemType = 'SERVICE'")
    Page<ServiceCatalogItem> findAllServices(Pageable pageable);

    @Query("""
            select s from ServiceCatalogItem s
            where s.itemType = 'SERVICE' and (s.validFrom = :effectiveFrom or s.validTo = :effectiveTo)
            """)
    Page<ServiceCatalogItem> findSearchProjectionTransitions(
            @Param("effectiveFrom") java.time.LocalDate effectiveFrom,
            @Param("effectiveTo") java.time.LocalDate effectiveTo,
            Pageable pageable);

    List<ServiceCatalogItem> findByTenantIdAndItemTypeOrderByName(Long tenantId, String itemType);
    Optional<ServiceCatalogItem> findByIdAndTenantIdAndItemType(Long id, Long tenantId, String itemType);
    List<ServiceCatalogItem> findByTenantIdAndItemTypeAndIdIn(Long tenantId, String itemType, java.util.Collection<Long> ids);
    boolean existsByTenantIdAndCode(Long tenantId, String code);

    @Query("""
            select s from ServiceCatalogItem s
            where s.tenantId = :tenantId and s.itemType = 'SERVICE' and s.status = 'ACTIVE'
              and s.serviceType = :serviceType
              and (:query is null or :query = '' or lower(s.code) like lower(concat(:query, '%'))
                   or lower(s.name) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.serviceSubtype, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.specimenType, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.examinationType, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.accountingCategory, '')) like lower(concat('%', :query, '%'))
                   or s.id in :searchIds
                   or exists (select local.id from OrganizationCatalogItem local
                       where local.tenantId = s.tenantId and local.catalogItemId = s.id
                         and local.organizationId = :organizationId
                         and (lower(local.localCode) like lower(concat(:query, '%'))
                              or lower(local.localName) like lower(concat('%', :query, '%')))))
            order by s.name, s.id
            """)
    List<ServiceCatalogItem> searchClinicalCandidates(@Param("tenantId") Long tenantId, @Param("query") String query,
            @Param("searchIds") java.util.Collection<Long> searchIds, @Param("serviceType") String serviceType,
            @Param("organizationId") Long organizationId);

    @Query("""
            select s from ServiceCatalogItem s
            where s.tenantId = :tenantId and s.itemType = 'SERVICE'
              and (:serviceType is null or :serviceType = '' or s.serviceType = :serviceType)
              and (:status is null or :status = '' or s.status = :status)
              and (:query is null or :query = '' or lower(s.code) like lower(concat(:query, '%'))
                   or lower(s.name) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.serviceSubtype, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.specimenType, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.examinationType, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.accountingCategory, '')) like lower(concat('%', :query, '%'))
                   or s.id in :searchIds)
            """)
    Page<ServiceCatalogItem> search(@Param("tenantId") Long tenantId, @Param("query") String query,
                                    @Param("searchIds") java.util.Collection<Long> searchIds,
                                    @Param("serviceType") String serviceType, @Param("status") String status,
                                    Pageable pageable);

    @Query("""
            select s from ServiceCatalogItem s
            where s.tenantId = :tenantId and s.itemType = 'SERVICE' and s.status = 'ACTIVE'
              and (:query is null or :query = '' or lower(s.code) like lower(concat(:query, '%'))
                   or lower(s.name) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.serviceSubtype, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.specimenType, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.examinationType, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.accountingCategory, '')) like lower(concat('%', :query, '%')))
              and not exists (select local.id from OrganizationCatalogItem local
                   where local.tenantId = s.tenantId and local.catalogItemId = s.id
                     and local.organizationId = :organizationId
                     and local.validFrom <= :at and (local.validTo is null or local.validTo >= :at))
              and (:sourceOrganizationId is null or not exists (select shared.id from OrganizationCatalogItem shared
                   where shared.tenantId = s.tenantId and shared.catalogItemId = s.id
                     and shared.organizationId = :sourceOrganizationId and shared.status <> 'SUSPENDED'
                     and shared.validFrom <= :at and (shared.validTo is null or shared.validTo >= :at)))
            """)
    Page<ServiceCatalogItem> searchUnadopted(@Param("tenantId") Long tenantId, @Param("query") String query,
                                             @Param("organizationId") Long organizationId,
                                             @Param("sourceOrganizationId") Long sourceOrganizationId,
                                             @Param("at") java.time.LocalDate at, Pageable pageable);
}
