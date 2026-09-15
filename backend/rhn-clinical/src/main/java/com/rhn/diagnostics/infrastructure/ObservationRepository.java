package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.Observation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ObservationRepository extends JpaRepository<Observation, Long> {}
