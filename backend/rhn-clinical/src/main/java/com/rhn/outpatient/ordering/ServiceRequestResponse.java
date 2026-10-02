package com.rhn.outpatient.ordering;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

record ServiceRequestResponse(
        Long id, long revision, Long residentId, Long encounterId, String requestNo, String status,
        Long catalogItemId, Long packageId, Long performerOrganizationId, Long performerDepartmentId,
        LocalDate businessDate, Instant authoredAt, Long authoredBy, String reason,
        String itemCode, String itemName, String unitCode, String localCode, String localName,
        Long adoptionId, long adoptionRevision, Long priceId, Long priceRevision,
        @DictionaryBinding(MasterDataDictionaryCodes.PRICE_TYPE) String priceType,
        BigDecimal quantity, BigDecimal unitPrice, BigDecimal totalAmount, String currencyCode,
        JsonNode itemAttributeSnapshot, String itemAttributeHash, Instant itemAttributeResolvedAt,
        JsonNode standardMappings,
        @DictionaryBinding(MasterDataDictionaryCodes.SERVICE_TYPE) String serviceType,
        String specimenType,
        @DictionaryBinding(MasterDataDictionaryCodes.EXAM_TYPE) String examinationType,
        String clinicalDescription,
        Instant cancelledAt, Long cancelledBy, String cancelReason, OrderDocumentInfo documentInfo, boolean documentInfoEditable) {
}
