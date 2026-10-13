package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.Invoice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {
    Optional<Invoice> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Invoice> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
    Optional<Invoice> findByTenantIdAndOrganizationIdAndInvoiceNo(Long tenantId, Long organizationId, String invoiceNo);
    List<Invoice> findByTenantIdAndPatientAccountIdOrderByIssuedAtAscIdAsc(Long tenantId, Long accountId);
}
