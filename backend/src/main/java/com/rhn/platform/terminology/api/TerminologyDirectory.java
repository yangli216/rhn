package com.rhn.platform.terminology.api;

import java.time.LocalDate;
import java.util.List;

/** Stable terminology lookup contract for business modules. */
public interface TerminologyDirectory {
    ConceptView requireValueSetMember(Long tenantId, String valueSetCode, String conceptCode, LocalDate atDate);
    List<ConceptView> expandValueSet(Long tenantId, String valueSetCode, LocalDate atDate);
    TerminologyConceptSnapshot requireConcept(Long tenantId, String codeSystemCode, String conceptCode,
                                              LocalDate atDate);
}
