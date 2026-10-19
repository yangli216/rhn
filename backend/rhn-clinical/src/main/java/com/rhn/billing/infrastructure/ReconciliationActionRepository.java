package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationAction;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
public interface ReconciliationActionRepository extends JpaRepository<ReconciliationAction,Long>{
 @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE) @Query("select a from ReconciliationAction a where a.tenantId=:tenant and a.commandCode=:command") Optional<ReconciliationAction> lock(@Param("tenant")Long tenant,@Param("command")String command);
 Optional<ReconciliationAction> findByTenantIdAndCommandCode(Long tenant,String command);
}
