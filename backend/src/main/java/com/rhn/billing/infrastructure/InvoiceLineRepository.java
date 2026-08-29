package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.InvoiceLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InvoiceLineRepository extends JpaRepository<InvoiceLine, Long> {
    List<InvoiceLine> findByTenantIdAndInvoiceIdOrderByLineNo(Long tenantId, Long invoiceId);
}
