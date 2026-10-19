package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationStatementRow;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface ReconciliationStatementRowRepository extends JpaRepository<ReconciliationStatementRow,Long> {
 @Query("select count(r) from ReconciliationStatementRow r where r.tenantId=:tenant and r.fileId=:file and r.organizationId is null and r.disposition<>'ACCEPTED_EXCEPTION'") long countUnresolvedUnallocated(@Param("tenant")Long tenant,@Param("file")Long file);

 @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE) @Query("select r from ReconciliationStatementRow r where r.tenantId=:tenant and r.id=:id") Optional<ReconciliationStatementRow> lock(@Param("tenant")Long tenant,@Param("id")Long id);
 Optional<ReconciliationStatementRow> findByIdAndTenantId(Long id,Long tenant);

 org.springframework.data.domain.Page<ReconciliationStatementRow> findByTenantIdAndFileIdAndOrganizationIdOrderByLineNumber(Long tenant,Long file,Long org,org.springframework.data.domain.Pageable page);
 org.springframework.data.domain.Page<ReconciliationStatementRow> findByTenantIdAndFileIdAndOrganizationIdIsNullOrderByLineNumber(Long tenant,Long file,org.springframework.data.domain.Pageable page);
 long countByTenantIdAndFileIdAndOrganizationIdIsNull(Long tenant,Long file);
}
