package com.rhn.healthcore.clinicaldocument;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface ClinicalDocumentRepository extends JpaRepository<ClinicalDocument, Long> {
    Optional<ClinicalDocument> findByIdAndTenantId(Long id, Long tenantId);
    Optional<ClinicalDocument> findByTenantIdAndEncounterIdAndDocumentTypeAndInstanceKey(
            Long tenantId, Long encounterId, String documentType, String instanceKey);
    List<ClinicalDocument> findByTenantIdAndEncounterIdOrderByUpdatedAtDesc(Long tenantId, Long encounterId);
    List<ClinicalDocument> findByTenantIdAndResidentIdOrderByUpdatedAtDesc(Long tenantId, Long residentId);
}
