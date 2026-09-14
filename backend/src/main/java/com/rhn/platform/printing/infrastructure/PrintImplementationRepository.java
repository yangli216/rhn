package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintImplementation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PrintImplementationRepository extends JpaRepository<PrintImplementation, Long> {
    List<PrintImplementation> findByStatusOrderByImplementationNameAsc(String status);
    Optional<PrintImplementation> findByTenantIdAndImplementationCode(Long tenantId, String implementationCode);
}
