package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.PaymentMerchantConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;

public interface PaymentMerchantConfigurationRepository extends JpaRepository<PaymentMerchantConfiguration, Long> {
    Optional<PaymentMerchantConfiguration> findByTenantIdAndOrganizationIdAndPaymentMethodCode(Long tenantId, Long organizationId, String paymentMethodCode);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from PaymentMerchantConfiguration c where c.tenantId=:tenant and c.organizationId=:organization and c.paymentMethodCode=:method")
    Optional<PaymentMerchantConfiguration> lock(@Param("tenant") Long tenantId, @Param("organization") Long organizationId, @Param("method") String method);
}
