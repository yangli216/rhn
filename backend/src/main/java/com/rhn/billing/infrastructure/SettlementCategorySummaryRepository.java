package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.SettlementCategorySummary;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettlementCategorySummaryRepository extends JpaRepository<SettlementCategorySummary, Long> {}
