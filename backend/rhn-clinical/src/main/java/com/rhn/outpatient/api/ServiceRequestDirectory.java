package com.rhn.outpatient.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Read-only boundary used by downstream clinical execution modules without exposing ordering internals. */
public interface ServiceRequestDirectory {
    ServiceRequestSnapshot requireForDiagnosticExchange(Long requestId);
    ServiceRequestSnapshot requireForDiagnosticExchange(String requestNo);
    List<ServiceRequestSnapshot> activeForExecution(Long organizationId, Long departmentId);

    record ServiceRequestSnapshot(
            Long id, long revision, Long tenantId, Long residentId, Long encounterId,
            String requestNo, String status, String serviceType, Long catalogItemId,
            String itemCode, String itemName, String localCode, String localName,
            String specimenType, String examinationType, BigDecimal quantity, String unitCode,
            Long performerOrganizationId, Long performerDepartmentId, LocalDate businessDate,
            Instant authoredAt, Long authoredBy, String reason, String clinicalDescription,
            BigDecimal totalAmount, String currencyCode,
            String itemAttributeHash, String itemAttributeSnapshot, String standardMappingSnapshot, String examinationPurpose) {}
}
