package com.rhn.platform.cryptography.infrastructure;

import com.rhn.platform.cryptography.domain.CertificateMaterial;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CertificateMaterialRepository extends JpaRepository<CertificateMaterial, Long> {
    Optional<CertificateMaterial> findByTenantIdAndFingerprint(Long tenantId, String fingerprint);
}
