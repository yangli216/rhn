package com.rhn.platform.cryptography.infrastructure;

import com.rhn.platform.cryptography.domain.CaSigner;
import com.rhn.platform.cryptography.domain.CaSignerStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CaSignerRepository extends JpaRepository<CaSigner, Long> {
    Optional<CaSigner> findByIdAndTenantId(Long id, Long tenantId);

    Optional<CaSigner> findByTenantIdAndVendorCodeAndExternalSignerId(Long tenantId, String vendorCode,
                                                                     String externalSignerId);

    List<CaSigner> findByTenantIdAndUserIdOrderByBoundAtDescIdDesc(Long tenantId, Long userId);

    List<CaSigner> findByTenantIdAndUserIdAndVendorCodeAndStatusOrderByBoundAtDescIdDesc(
            Long tenantId, Long userId, String vendorCode, CaSignerStatus status);

    List<CaSigner> findByTenantIdAndVendorCodeAndCertificateFingerprintAndStatus(
            Long tenantId, String vendorCode, String certificateFingerprint, CaSignerStatus status);

    List<CaSigner> findByTenantIdAndCertificateFingerprintAndStatus(
            Long tenantId, String certificateFingerprint, CaSignerStatus status);
}
