package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintOutput;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PrintOutputRepository extends JpaRepository<PrintOutput, Long> {
    Optional<PrintOutput> findByIdAndTenantId(Long id, Long tenantId);
}
