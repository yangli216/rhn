package com.rhn.healthcore.clinicaldocument;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface ClinicalDocumentVersionRepository extends JpaRepository<ClinicalDocumentVersion, Long> {
    Optional<ClinicalDocumentVersion> findByDocumentIdAndVersionNumber(Long documentId, int versionNumber);
    List<ClinicalDocumentVersion> findByDocumentIdOrderByVersionNumberDesc(Long documentId);
}
