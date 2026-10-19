package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationItemEvent; import org.springframework.data.jpa.repository.JpaRepository;
public interface ReconciliationItemEventRepository extends JpaRepository<ReconciliationItemEvent,Long>{
 java.util.Optional<ReconciliationItemEvent> findByTenantIdAndReconciliationItemIdAndCommandCode(Long tenant,Long item,String command);
 java.util.List<ReconciliationItemEvent> findByTenantIdAndReconciliationItemIdOrderByOccurredAt(Long tenant,Long item);
}
