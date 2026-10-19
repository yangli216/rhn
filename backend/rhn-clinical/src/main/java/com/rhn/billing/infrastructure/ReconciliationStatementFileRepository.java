package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationStatementFile;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface ReconciliationStatementFileRepository extends JpaRepository<ReconciliationStatementFile,Long> {
 Optional<ReconciliationStatementFile> findByTenantIdAndTaskIdAndAttempt(Long tenant,Long task,int attempt);
 Optional<ReconciliationStatementFile> findByIdAndTenantId(Long id,Long tenant);
 List<ReconciliationStatementFile> findByTenantIdAndTaskIdOrderByAttemptDesc(Long tenant,Long task);
}
