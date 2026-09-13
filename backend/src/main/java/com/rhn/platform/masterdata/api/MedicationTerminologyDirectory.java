package com.rhn.platform.masterdata.api;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Medication classifications and controlled allergen concepts shared with clinical safety modules. */
public interface MedicationTerminologyDirectory {
    Map<Long, List<MedicationClassification>> classifications(Long tenantId, Collection<Long> medicationIds);
    Map<Long, List<Long>> allergenConceptIds(Long tenantId, Collection<Long> medicationIds);
    List<AllergenTerm> searchAllergens(Long tenantId, String categoryCode, String query);
    Optional<AllergenTerm> findAllergen(Long tenantId, Long allergenId);
    boolean medicationMatchesAllergen(Long tenantId, Long medicationId, Long allergenId);

    record MedicationClassification(Long conceptId, String systemCode, String systemName, String systemVersion,
                                    String classificationType, String code, String display, String path,
                                    String mappingRole, boolean primary) {}

    record AllergenTerm(Long id, Long parentId, String categoryCode, String conceptType,
                        String codeSystemUri, String code, String display, String aliases) {}
}
