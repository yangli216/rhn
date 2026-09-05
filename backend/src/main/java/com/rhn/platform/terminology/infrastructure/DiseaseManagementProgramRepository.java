package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.DiseaseManagementProgram;
import com.rhn.platform.terminology.domain.TerminologyScope;
import com.rhn.platform.terminology.domain.TerminologyStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface DiseaseManagementProgramRepository extends JpaRepository<DiseaseManagementProgram, Long> {
    boolean existsByScopeTypeAndScopeIdAndCode(TerminologyScope scopeType, Long scopeId, String code);
    List<DiseaseManagementProgram> findAllByOrderByName();

    @Query("""
            select p from DiseaseManagementProgram p
            where (p.scopeType = com.rhn.platform.terminology.domain.TerminologyScope.PRODUCT
                   or (p.scopeType = com.rhn.platform.terminology.domain.TerminologyScope.TENANT
                       and p.scopeId = :tenantId))
              and (:managementType is null or :managementType = '' or p.managementType = :managementType)
              and (:status is null or p.status = :status)
              and (:query is null or :query = '' or lower(p.code) like lower(concat('%', :query, '%'))
                   or lower(p.name) like lower(concat('%', :query, '%'))
                   or lower(coalesce(p.description, '')) like lower(concat('%', :query, '%')))
            """)
    Page<DiseaseManagementProgram> searchVisible(@Param("tenantId") Long tenantId,
            @Param("query") String query, @Param("managementType") String managementType,
            @Param("status") TerminologyStatus status, Pageable pageable);
}
