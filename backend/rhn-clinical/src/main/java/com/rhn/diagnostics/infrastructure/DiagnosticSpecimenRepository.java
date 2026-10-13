package com.rhn.diagnostics.infrastructure;
import com.rhn.diagnostics.domain.DiagnosticSpecimen;
import org.springframework.data.jpa.repository.*;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
public interface DiagnosticSpecimenRepository extends JpaRepository<DiagnosticSpecimen,Long> {
    Optional<DiagnosticSpecimen> findByIdAndTenantId(Long id,Long tenantId);
    Optional<DiagnosticSpecimen> findByTenantIdAndOrganizationIdAndSpecimenNo(Long tenantId,Long organizationId,String specimenNo);
    List<DiagnosticSpecimen> findByTenantIdAndOrganizationIdAndCreationCommandOrderByCreatedAtAsc(
            Long tenantId,Long organizationId,String creationCommand);
    Optional<DiagnosticSpecimen> findByTenantIdAndPreviousSpecimenId(Long tenantId,Long previousSpecimenId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select specimen from DiagnosticSpecimen specimen where specimen.id=:id and specimen.tenantId=:tenantId")
    Optional<DiagnosticSpecimen> lockByIdAndTenantId(Long id,Long tenantId);
    @Query("""
            select specimen from DiagnosticSpecimen specimen, DiagnosticSpecimenTask link
            where specimen.tenantId=:tenantId and link.tenantId=:tenantId
              and link.taskId=:taskId and link.specimenId=specimen.id order by specimen.createdAt, specimen.id
            """)
    List<DiagnosticSpecimen> findForTask(Long tenantId,Long taskId);
}
