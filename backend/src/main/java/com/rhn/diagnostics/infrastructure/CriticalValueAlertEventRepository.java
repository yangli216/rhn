package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.CriticalValueAlertEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CriticalValueAlertEventRepository extends JpaRepository<CriticalValueAlertEvent, Long> {}
