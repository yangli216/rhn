package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface ReconciliationAttemptRepository extends JpaRepository<ReconciliationAttempt,Long>{
 Optional<ReconciliationAttempt> findByTenantIdAndTaskIdAndClaimToken(Long tenant,Long task,long token);
 List<ReconciliationAttempt> findTop50ByTenantIdAndTaskIdOrderByAttemptDesc(Long tenant,Long task);
}
