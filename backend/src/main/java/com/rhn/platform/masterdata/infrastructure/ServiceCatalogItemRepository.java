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
    List<ServiceCatalogItem> findByTenantIdAndItemTypeOrderByName(Long tenantId, String itemType);
    Optional<ServiceCatalogItem> findByIdAndTenantIdAndItemType(Long id, Long tenantId, String itemType);
    boolean existsByTenantIdAndCode(Long tenantId, String code);

    @Query("""
            select s from ServiceCatalogItem s
            where s.tenantId = :tenantId and s.itemType = 'SERVICE'
              and (:serviceType is null or :serviceType = '' or s.serviceType = :serviceType)
              and (:status is null or :status = '' or s.status = :status)
              and (:query is null or :query = '' or lower(s.code) like lower(concat('%', :query, '%'))
                   or lower(s.name) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.serviceSubtype, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.specimenType, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.examinationType, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(s.accountingCategory, '')) like lower(concat('%', :query, '%')))
            """)
    Page<ServiceCatalogItem> search(@Param("tenantId") Long tenantId, @Param("query") String query,
                                    @Param("serviceType") String serviceType, @Param("status") String status,
                                    Pageable pageable);
}
