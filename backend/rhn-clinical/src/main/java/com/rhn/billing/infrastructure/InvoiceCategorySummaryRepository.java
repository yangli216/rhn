package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.InvoiceCategorySummary;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InvoiceCategorySummaryRepository extends JpaRepository<InvoiceCategorySummary, Long> {}
