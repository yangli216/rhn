package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationItem; import jakarta.persistence.LockModeType; import org.springframework.data.jpa.repository.*; import org.springframework.data.repository.query.Param; import java.util.*;
public interface ReconciliationItemRepository extends JpaRepository<ReconciliationItem,Long>{
 @Query("select i.paymentId as paymentId,b.businessDate as businessDate from ReconciliationItem i join ReconciliationBatch b on b.id=i.reconciliationBatchId and b.tenantId=i.tenantId join ReconciliationTask t on t.id=b.reconciliationTaskId and t.tenantId=b.tenantId where i.tenantId=:tenant and i.paymentId in :payments and i.matchType in ('MATCHED','TIME_DIFFERENCE') and t.latestFileId=b.statementFileId")
 List<PaymentBillDate> matchedDates(@Param("tenant")Long tenant,@Param("payments")java.util.Collection<Long> payments);
 interface PaymentBillDate {Long getPaymentId();java.time.LocalDate getBusinessDate();}
 @Query("select i from ReconciliationItem i where i.tenantId=:tenant and i.reconciliationBatchId=:batch and (:differences=false or i.matchType not in ('MATCHED','TIME_DIFFERENCE')) order by i.id")
 org.springframework.data.domain.Page<ReconciliationItem> page(@Param("tenant")Long tenant,@Param("batch")Long batch,@Param("differences")boolean differences,org.springframework.data.domain.Pageable page);

 org.springframework.data.domain.Page<ReconciliationItem> findByTenantIdAndReconciliationBatchIdOrderById(Long tenant,Long batch,org.springframework.data.domain.Pageable page);
 org.springframework.data.domain.Page<ReconciliationItem> findByTenantIdAndReconciliationBatchIdAndMatchTypeNotOrderById(Long tenant,Long batch,String match,org.springframework.data.domain.Pageable page);

 List<ReconciliationItem>findByTenantIdAndReconciliationBatchIdOrderById(Long tenantId,Long batchId);
 List<ReconciliationItem>findByTenantIdAndReconciliationBatchIdInOrderByReconciliationBatchIdAscIdAsc(
         Long tenantId,java.util.Collection<Long> batchIds);
 long countByTenantIdAndReconciliationBatchIdAndStatus(Long tenantId,Long batchId,String status);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select v from ReconciliationItem v where v.id=:id and v.tenantId=:tenantId") Optional<ReconciliationItem>lock(@Param("id")Long id,@Param("tenantId")Long tenantId);
}
