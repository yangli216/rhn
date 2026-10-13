package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.DiagnosticSpecimenBatch;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DiagnosticSpecimenBatchRepository extends JpaRepository<DiagnosticSpecimenBatch, Long> {}
