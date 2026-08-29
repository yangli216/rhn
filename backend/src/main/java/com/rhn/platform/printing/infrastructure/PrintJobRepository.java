package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PrintJobRepository extends JpaRepository<PrintJob, Long> {
    Optional<PrintJob> findByIdAndTenantId(Long id, Long tenantId);
}
