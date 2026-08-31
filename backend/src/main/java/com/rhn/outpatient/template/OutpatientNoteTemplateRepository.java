package com.rhn.outpatient.template;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

interface OutpatientNoteTemplateRepository extends JpaRepository<OutpatientNoteTemplate, Long> {
    @Query("""
            select value from OutpatientNoteTemplate value
             where value.tenantId = :tenantId and value.organizationId = :organizationId
               and value.departmentId = :departmentId and value.specialtyCode = :specialtyCode
               and value.documentType = :documentType and value.status = 'ACTIVE'
               and ((value.scopeType = 'PERSONAL' and value.ownerId = :practitionerId)
                 or value.scopeType = 'DEPARTMENT')
             order by value.sortOrder asc, value.useCount desc, value.updatedAt desc
            """)
    List<OutpatientNoteTemplate> findVisible(@Param("tenantId") Long tenantId,
                                              @Param("organizationId") Long organizationId,
                                              @Param("departmentId") Long departmentId,
                                              @Param("practitionerId") Long practitionerId,
                                              @Param("specialtyCode") String specialtyCode,
                                              @Param("documentType") String documentType);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from OutpatientNoteTemplate value where value.id = :id and value.tenantId = :tenantId")
    Optional<OutpatientNoteTemplate> lockByIdAndTenantId(@Param("id") Long id,
                                                          @Param("tenantId") Long tenantId);
}
