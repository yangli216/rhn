package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefQualification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ReliefQualificationRepository extends JpaRepository<ReliefQualification, Long> {
    List<ReliefQualification> findByTenantIdAndPolicyVersionIdOrderByLineNoAsc(Long tenantId, Long policyVersionId);
    List<ReliefQualification> findByTenantIdAndPolicyVersionIdInOrderByLineNoAsc(Long tenantId, Collection<Long> policyVersionIds);
    void deleteByTenantIdAndPolicyVersionId(Long tenantId, Long policyVersionId);
}
