package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationTask;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface ReconciliationTaskRepository extends JpaRepository<ReconciliationTask,Long> {
 Optional<ReconciliationTask> findByIdAndTenantId(Long id,Long tenant);
 Optional<ReconciliationTask> findByTenantIdAndMerchantScopeAndBusinessDateAndCurrencyCode(Long tenant,String scope,java.time.LocalDate date,String currency);
 Optional<ReconciliationTask> findByTenantIdAndRequestCode(Long tenant,String code);
 @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE) @Query("select t from ReconciliationTask t where t.id=:id") Optional<ReconciliationTask> lock(@Param("id")Long id);
 @Query("select t.id from ReconciliationTask t where t.status in ('QUEUED','RETRY_WAIT','WAITING_STATEMENT','RUNNING') and t.nextAttemptAt<=:now and (t.status<>'RUNNING' or t.leaseUntil<=:now) order by t.nextAttemptAt,t.id") List<Long> due(@Param("now")java.time.Instant now,org.springframework.data.domain.Pageable page);
 @Query("select t from ReconciliationTask t where t.tenantId=:tenant and t.merchantScope=:scope and t.businessDate between :from and :to and (:status is null or t.status=:status) order by t.createdAt desc,t.id desc")
 org.springframework.data.domain.Page<ReconciliationTask> page(@Param("tenant")Long tenant,@Param("scope")String scope,@Param("from")java.time.LocalDate from,@Param("to")java.time.LocalDate to,@Param("status")String status,org.springframework.data.domain.Pageable page);
}
