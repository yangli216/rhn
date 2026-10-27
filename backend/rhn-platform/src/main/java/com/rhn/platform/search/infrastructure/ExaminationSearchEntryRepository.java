package com.rhn.platform.search.infrastructure;

import com.rhn.platform.search.domain.SearchEntry;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

/** 先在数据库按可开立范围过滤、按部位去重，再限量；不把未启用机构的命中占用候选名额。 */
public interface ExaminationSearchEntryRepository extends Repository<SearchEntry, Long> {
    @Query("""
            select v.id from SearchEntry e
            join ServiceVariant v on v.id = e.targetId and v.tenantId = :tenantId
            join ServiceCatalogItem s on s.id = v.catalogItemId and s.tenantId = :tenantId
            where e.targetType = 'SERVICE_VARIANT' and e.scopeType = 'TENANT'
              and e.scopeId = :tenantId and e.tenantId = :tenantId and e.status = 'ACTIVE'
              and v.status = 'ACTIVE' and s.status = 'ACTIVE' and s.orderable = true
              and s.serviceType = 'EXAMINATION' and s.usageType in ('OUTPATIENT', 'COMMON')
              and s.validFrom <= :at and (s.validTo is null or s.validTo >= :at)
              and exists (select p.catalogItemId from ExaminationService p
                          where p.tenantId = :tenantId and p.catalogItemId = s.id)
              and exists (select a.id from OrganizationCatalogItem a
                          where a.tenantId = :tenantId and a.organizationId = :organizationId
                            and a.catalogItemId = s.id and a.status = 'ACTIVE'
                            and a.orderable = true and a.executable = true
                            and a.validFrom <= :at and (a.validTo is null or a.validTo >= :at))
              and (e.searchName like :prefix escape '!' or e.pinyinCode like :prefix escape '!')
            group by v.id
            order by min(case when e.searchName = :query or e.pinyinCode = :query then 0 else 1 end), v.id
            """)
    List<Long> findOrderableVariantIds(@Param("tenantId") Long tenantId,
                                      @Param("organizationId") Long organizationId,
                                      @Param("at") LocalDate at, @Param("query") String query,
                                      @Param("prefix") String prefix, Pageable pageable);
}
