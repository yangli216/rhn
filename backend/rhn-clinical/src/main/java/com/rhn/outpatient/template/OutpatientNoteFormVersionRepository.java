package com.rhn.outpatient.template;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

interface OutpatientNoteFormVersionRepository extends JpaRepository<OutpatientNoteFormVersion, Long> {
    @Query("""
            select value from OutpatientNoteFormVersion value
             where value.tenantId = :tenantId and value.organizationId = :organizationId
               and value.departmentId = :departmentId and value.specialtyCode = :specialtyCode
               and value.status = 'PUBLISHED'
             order by value.name asc, value.formCode asc
            """)
    List<OutpatientNoteFormVersion> findPublished(@Param("tenantId") Long tenantId,
                                                   @Param("organizationId") Long organizationId,
                                                   @Param("departmentId") Long departmentId,
                                                   @Param("specialtyCode") String specialtyCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select value from OutpatientNoteFormVersion value
             where value.tenantId = :tenantId and value.organizationId = :organizationId
               and value.departmentId = :departmentId and value.formCode = :formCode
               and value.status = 'PUBLISHED'
            """)
    Optional<OutpatientNoteFormVersion> lockPublished(@Param("tenantId") Long tenantId,
                                                       @Param("organizationId") Long organizationId,
                                                       @Param("departmentId") Long departmentId,
                                                       @Param("formCode") String formCode);

    Optional<OutpatientNoteFormVersion> findByIdAndTenantId(Long id, Long tenantId);
}
