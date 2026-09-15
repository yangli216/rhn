package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationItem; import jakarta.persistence.LockModeType; import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param; import java.util.*;
public interface ReconciliationItemRepository extends JpaRepository<ReconciliationItem,Long>{
 List<ReconciliationItem>findByTenantIdAndReconciliationBatchIdOrderById(Long tenantId,Long batchId);
 long countByTenantIdAndReconciliationBatchIdAndStatus(Long tenantId,Long batchId,String status);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select v from ReconciliationItem v where v.id=:id and v.tenantId=:tenantId") Optional<ReconciliationItem>lock(@Param("id")Long id,@Param("tenantId")Long tenantId);
}
