package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefQuotaTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReliefQuotaTransactionRepository extends JpaRepository<ReliefQuotaTransaction, Long> {
    boolean existsByTenantIdAndCommandCode(Long tenantId, String commandCode);
    List<ReliefQuotaTransaction> findByTenantIdAndApplicationIdOrderByOccurredAtAscIdAsc(Long tenantId, Long applicationId);
}
