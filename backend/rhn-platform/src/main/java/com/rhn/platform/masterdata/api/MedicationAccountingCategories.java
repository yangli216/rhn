package com.rhn.platform.masterdata.api;

import java.util.Locale;

/** Classifies an explicit medication type snapshot. Null means the source cannot establish a category. */
public final class MedicationAccountingCategories {
    private MedicationAccountingCategories() {}

    public static String fromMedicationType(String medicationType) {
        if (medicationType == null || medicationType.isBlank()) return null;
        return switch (medicationType.trim().toUpperCase(Locale.ROOT)) {
            case "WESTERN", "WESTERN_MED" -> "WESTERN_MED";
            case "CHINESE_PATENT", "CHINESE_PATENT_MED" -> "CHINESE_PATENT_MED";
            case "HERBAL", "HERBAL_MED" -> "HERBAL_MED";
            // These known medication types establish only the broad medication category.
            case "VACCINE", "ETHNIC", "IN_HOUSE" -> "MEDICATION";
            default -> null;
        };
    }
}
