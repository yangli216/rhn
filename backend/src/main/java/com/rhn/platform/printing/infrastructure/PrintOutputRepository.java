package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintOutput;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface PrintOutputRepository extends JpaRepository<PrintOutput, Long> {
    Optional<PrintOutput> findByIdAndTenantId(Long id, Long tenantId);
    List<PrintOutput> findByTenantIdAndEncounterIdOrderByGeneratedAtDesc(Long tenantId, Long encounterId);
}
