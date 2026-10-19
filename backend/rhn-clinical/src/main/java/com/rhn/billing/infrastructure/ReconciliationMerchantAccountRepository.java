package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationMerchantAccount;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
public interface ReconciliationMerchantAccountRepository extends JpaRepository<ReconciliationMerchantAccount,Long>{
 Optional<ReconciliationMerchantAccount> findByMerchantScope(String scope);
 @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE) @Query("select a from ReconciliationMerchantAccount a where a.merchantScope=:scope") Optional<ReconciliationMerchantAccount> lock(@Param("scope")String scope);
}
