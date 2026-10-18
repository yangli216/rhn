package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefPolicy;
import com.rhn.billing.domain.ReliefPolicyStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ReliefPolicyRepository extends JpaRepository<ReliefPolicy, Long> {
    Optional<ReliefPolicy> findByIdAndTenantId(Long id, Long tenantId);
    Optional<ReliefPolicy> findByTenantIdAndCode(Long tenantId, String code);
    List<ReliefPolicy> findByTenantIdOrderByCodeAsc(Long tenantId);
    List<ReliefPolicy> findByTenantIdAndStatus(Long tenantId, ReliefPolicyStatus status);
}
