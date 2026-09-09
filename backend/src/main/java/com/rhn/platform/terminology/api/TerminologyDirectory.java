package com.rhn.platform.terminology.api;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** Stable terminology lookup contract for business modules. */
public interface TerminologyDirectory {
    ConceptView requireValueSetMember(Long tenantId, String valueSetCode, String conceptCode, LocalDate atDate);
    Optional<ConceptView> findValueSetMember(Long tenantId, String valueSetCode, String codeDisplayOrAlias,
                                             LocalDate atDate);
    List<ConceptView> expandValueSet(Long tenantId, String valueSetCode, LocalDate atDate);
    TerminologyConceptSnapshot requireConcept(Long tenantId, String codeSystemCode, String conceptCode,
                                              LocalDate atDate);
    Optional<TerminologyConceptSnapshot> findConcept(Long tenantId, String codeSystemCode, String conceptCode,
                                                     LocalDate atDate);
    List<CodeSystemSnapshot> listCodeSystems();
    List<CodeSystemSnapshot> findCodeSystems(Collection<Long> ids);
    Optional<CodeSystemSnapshot> findCodeSystem(Long id);
    List<ConceptSnapshot> listConcepts(Long codeSystemId);
    List<ConceptSnapshot> findConcepts(Collection<Long> ids);
    Optional<ConceptSnapshot> findConcept(Long id);
    DiseaseReferenceSnapshot requireDisease(Long tenantId, Long conceptId, LocalDate atDate);
}
