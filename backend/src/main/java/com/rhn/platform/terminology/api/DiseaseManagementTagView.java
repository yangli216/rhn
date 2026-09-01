package com.rhn.platform.terminology.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

public record DiseaseManagementTagView(
        Long id, String code, String name,
        @DictionaryBinding("BD_DISEASE_MANAGEMENT_TYPE") String sdManagementType,
        @DictionaryBinding("BD_DISEASE_TRIGGER_ACTION") String sdTriggerAction,
        String reportCardType, Integer reportDeadlineHours
) {}
