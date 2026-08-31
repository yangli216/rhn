package com.rhn.outpatient.template;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

interface OutpatientPlanTemplateRepository extends JpaRepository<OutpatientPlanTemplate, Long> {
    @Query("""
            select value from OutpatientPlanTemplate value
             where value.tenantId = :tenantId and value.organizationId = :organizationId
               and value.departmentId = :departmentId and value.status = 'ACTIVE'
               and ((value.scopeType = 'PERSONAL' and value.ownerId = :practitionerId)
                 or value.scopeType = 'DEPARTMENT')
             order by value.sortOrder asc, value.useCount desc, value.updatedAt desc
            """)
    List<OutpatientPlanTemplate> findVisible(@Param("tenantId") Long tenantId,
                                              @Param("organizationId") Long organizationId,
                                              @Param("departmentId") Long departmentId,
                                              @Param("practitionerId") Long practitionerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from OutpatientPlanTemplate value where value.id = :id and value.tenantId = :tenantId")
    Optional<OutpatientPlanTemplate> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

interface OutpatientPlanDiagnosisRepository extends JpaRepository<OutpatientPlanDiagnosis, Long> {
    List<OutpatientPlanDiagnosis> findByTenantIdAndTemplateIdOrderByLineNo(Long tenantId, Long templateId);
    List<OutpatientPlanDiagnosis> findByTenantIdAndTemplateIdInOrderByTemplateIdAscLineNoAsc(
            Long tenantId, List<Long> templateIds);
}

interface OutpatientPlanMedicationRepository extends JpaRepository<OutpatientPlanMedication, Long> {
    List<OutpatientPlanMedication> findByTenantIdAndTemplateIdOrderByLineNo(Long tenantId, Long templateId);
    List<OutpatientPlanMedication> findByTenantIdAndTemplateIdInOrderByTemplateIdAscLineNoAsc(
            Long tenantId, List<Long> templateIds);
}

interface OutpatientPlanServiceRepository extends JpaRepository<OutpatientPlanServiceLine, Long> {
    List<OutpatientPlanServiceLine> findByTenantIdAndTemplateIdOrderByLineNo(Long tenantId, Long templateId);
    List<OutpatientPlanServiceLine> findByTenantIdAndTemplateIdInOrderByTemplateIdAscLineNoAsc(
            Long tenantId, List<Long> templateIds);
}
