package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationPolicy;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface ReconciliationPolicyRepository extends JpaRepository<ReconciliationPolicy,Long> {
 Optional<ReconciliationPolicy> findByTenantIdAndOrganizationIdAndPaymentMethodCode(Long tenant,Long org,String method);
 List<ReconciliationPolicy> findByAutoEnabledTrue();
 List<ReconciliationPolicy> findByMerchantScope(String scope);
 List<ReconciliationPolicy> findByTenantIdAndMerchantScope(Long tenant,String scope);
}
