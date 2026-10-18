package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefQuota;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ReliefQuotaRepository extends JpaRepository<ReliefQuota, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select value from ReliefQuota value
            where value.tenantId = :tenantId and value.policyId = :policyId and value.residentId = :residentId
              and value.periodKey = :periodKey and value.shareKey = :shareKey and value.scopeKey = :scopeKey
            """)
    Optional<ReliefQuota> lockByKey(@Param("tenantId") Long tenantId, @Param("policyId") Long policyId,
                                    @Param("residentId") Long residentId, @Param("periodKey") String periodKey,
                                    @Param("shareKey") String shareKey, @Param("scopeKey") String scopeKey);

    Optional<ReliefQuota> findByTenantIdAndPolicyIdAndResidentIdAndPeriodKeyAndShareKeyAndScopeKey(
            Long tenantId, Long policyId, Long residentId, String periodKey, String shareKey, String scopeKey);

    List<ReliefQuota> findByTenantIdAndResidentIdAndPolicyIdIn(Long tenantId, Long residentId,
                                                              Collection<Long> policyIds);
}
