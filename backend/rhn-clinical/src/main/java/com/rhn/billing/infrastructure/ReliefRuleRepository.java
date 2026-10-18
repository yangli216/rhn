package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ReliefRuleRepository extends JpaRepository<ReliefRule, Long> {
    List<ReliefRule> findByTenantIdAndPolicyVersionIdOrderByLineNoAsc(Long tenantId, Long policyVersionId);
    List<ReliefRule> findByTenantIdAndPolicyVersionIdInOrderByLineNoAsc(Long tenantId, Collection<Long> policyVersionIds);
    void deleteByTenantIdAndPolicyVersionId(Long tenantId, Long policyVersionId);
}
