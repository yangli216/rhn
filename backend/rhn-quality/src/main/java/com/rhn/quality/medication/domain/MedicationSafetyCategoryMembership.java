package com.rhn.quality.medication.domain;

/** Domain port for category membership; rule evaluation does not depend on application/storage services. */
@FunctionalInterface
public interface MedicationSafetyCategoryMembership {
    boolean isMedicationInCategory(Long tenantId, Long medicationId, String medicationName,
                                   String categoryCode, String doseForm);

    default boolean isMedicationInCategory(Long tenantId, Long medicationId, String medicationName, String categoryCode) {
        return isMedicationInCategory(tenantId, medicationId, medicationName, categoryCode, null);
    }
}
