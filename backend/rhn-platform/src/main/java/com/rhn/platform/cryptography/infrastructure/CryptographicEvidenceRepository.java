package com.rhn.platform.cryptography.infrastructure;

import com.rhn.platform.cryptography.domain.CryptographicEvidence;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CryptographicEvidenceRepository extends JpaRepository<CryptographicEvidence, Long> {
    Optional<CryptographicEvidence> findByIdAndTenantId(Long id, Long tenantId);

    Optional<CryptographicEvidence> findFirstByTenantIdAndTargetTypeAndTargetIdOrderByRecordedAtDescIdDesc(
            Long tenantId, String targetType, Long targetId);
}
