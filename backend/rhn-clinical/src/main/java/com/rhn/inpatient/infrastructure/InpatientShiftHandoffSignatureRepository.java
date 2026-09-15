package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientShiftHandoffSignature;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InpatientShiftHandoffSignatureRepository
        extends JpaRepository<InpatientShiftHandoffSignature, Long> {
    Optional<InpatientShiftHandoffSignature> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
    List<InpatientShiftHandoffSignature> findByTenantIdAndHandoffIdOrderBySignedAtAscIdAsc(
            Long tenantId, Long handoffId);
}
