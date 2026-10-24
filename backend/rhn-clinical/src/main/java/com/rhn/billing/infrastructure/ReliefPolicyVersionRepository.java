package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefPolicyVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ReliefPolicyVersionRepository extends JpaRepository<ReliefPolicyVersion, Long> {
    Optional<ReliefPolicyVersion> findByIdAndTenantId(Long id, Long tenantId);
    List<ReliefPolicyVersion> findByTenantIdAndPolicyIdOrderByVersionNoDesc(Long tenantId, Long policyId);
    List<ReliefPolicyVersion> findByTenantIdAndPolicyIdInOrderByPolicyIdAscVersionNoDesc(
            Long tenantId, Collection<Long> policyIds);
    List<ReliefPolicyVersion> findByTenantIdAndIdIn(Long tenantId, Collection<Long> ids);
}
