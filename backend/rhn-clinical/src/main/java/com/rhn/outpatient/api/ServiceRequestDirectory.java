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

    /**
     * Batch form of {@link #requireForDiagnosticExchange(Long)} for list assembly: same 404/403 semantics, any
     * missing or inaccessible id throws.
     */
    default java.util.Map<Long, ServiceRequestSnapshot> forDiagnosticExchange(java.util.Collection<Long> requestIds) {
        java.util.Map<Long, ServiceRequestSnapshot> result = new java.util.LinkedHashMap<>();
        for (Long id : requestIds) {
            if (id != null && !result.containsKey(id)) result.put(id, requireForDiagnosticExchange(id));
        }
        return result;
    }

    record ServiceRequestSnapshot(
            Long id, long revision, Long tenantId, Long residentId, Long encounterId,
            String requestNo, String status, String serviceType, Long catalogItemId,
            String itemCode, String itemName, String localCode, String localName,
            String specimenType, String examinationType, BigDecimal quantity, String unitCode,
            Long performerOrganizationId, Long performerDepartmentId, LocalDate businessDate,
            Instant authoredAt, Long authoredBy, String reason, String clinicalDescription,
            BigDecimal totalAmount, String currencyCode,
            String itemAttributeHash, String itemAttributeSnapshot, String standardMappingSnapshot, String examinationPurpose,
            /** 检查部位名称，按开立顺序以顿号连接；未选部位为空。 */
            String bodySiteText) {}
}
