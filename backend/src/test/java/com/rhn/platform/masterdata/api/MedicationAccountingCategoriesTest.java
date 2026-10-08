package com.rhn.platform.masterdata.api;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.Locale;
import static org.junit.jupiter.api.Assertions.*;

class MedicationAccountingCategoriesTest {
    @ParameterizedTest @CsvSource({"WESTERN,WESTERN_MED", "WESTERN_MED,WESTERN_MED", "CHINESE_PATENT,CHINESE_PATENT_MED", "CHINESE_PATENT_MED,CHINESE_PATENT_MED", "HERBAL,HERBAL_MED", "HERBAL_MED,HERBAL_MED", "VACCINE,MEDICATION", "ETHNIC,MEDICATION", "IN_HOUSE,MEDICATION"})
    void maps_only_known_medication_types(String type,String expected) { assertEquals(expected,MedicationAccountingCategories.fromMedicationType(type)); }
    @ParameterizedTest @NullAndEmptySource @ValueSource(strings={" ","UNKNOWN","OUTPATIENT","MEDICATION"})
    void absent_or_unknown_type_does_not_become_western_medicine(String type) { assertNull(MedicationAccountingCategories.fromMedicationType(type)); }
    @Test void normalization_does_not_depend_on_machine_locale() {
        var before=Locale.getDefault();try {Locale.setDefault(Locale.forLanguageTag("tr-TR"));assertEquals("CHINESE_PATENT_MED",MedicationAccountingCategories.fromMedicationType(" chinese_patent "));}finally {Locale.setDefault(before);}
    }
}
