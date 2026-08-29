package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationBatch; import jakarta.persistence.LockModeType; import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param;
import java.util.*;
import java.time.LocalDate;
public interface ReconciliationBatchRepository extends JpaRepository<ReconciliationBatch,Long>{
 Optional<ReconciliationBatch>findByIdAndTenantId(Long id,Long tenantId); Optional<ReconciliationBatch>findByTenantIdAndCommandCode(Long tenantId,String commandCode);
 Optional<ReconciliationBatch>findByTenantIdAndOrganizationIdAndReconciliationTypeAndSourceCodeAndBusinessDateAndCurrencyCode(
  Long tenantId,Long organizationId,String reconciliationType,String sourceCode,LocalDate businessDate,String currencyCode);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select v from ReconciliationBatch v where v.id=:id and v.tenantId=:tenantId") Optional<ReconciliationBatch>lock(@Param("id")Long id,@Param("tenantId")Long tenantId);
 List<ReconciliationBatch>findTop100ByTenantIdAndOrganizationIdOrderByCreatedAtDesc(Long tenantId,Long organizationId);
}
