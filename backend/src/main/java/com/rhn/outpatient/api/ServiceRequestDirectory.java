package com.rhn.outpatient.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** Read-only boundary used by diagnostic exchange without exposing ordering internals. */
public interface ServiceRequestDirectory {
    ServiceRequestSnapshot requireForDiagnosticExchange(Long requestId);
    ServiceRequestSnapshot requireForDiagnosticExchange(String requestNo);

    record ServiceRequestSnapshot(
            Long id, long revision, Long tenantId, Long residentId, Long encounterId,
            String requestNo, String status, String serviceType, Long catalogItemId,
            String itemCode, String itemName, String localCode, String localName,
            String specimenType, String examinationType, BigDecimal quantity, String unitCode,
            Long performerOrganizationId, Long performerDepartmentId, LocalDate businessDate,
            Instant authoredAt, Long authoredBy, String reason, String clinicalDescription,
            String itemAttributeHash, String itemAttributeSnapshot, String standardMappingSnapshot) {}
}
