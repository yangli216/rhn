package com.rhn.platform.terminology.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.time.LocalDate;
import java.util.List;

public record DiseaseManagementProgramView(
        Long id, long revision, String scopeType, Long scopeId, String code, String name,
        @DictionaryBinding("BD_DISEASE_MANAGEMENT_TYPE") String sdManagementType,
        @DictionaryBinding("BD_DISEASE_TRIGGER_ACTION") String sdTriggerAction,
        String description, String reportCardType, Integer reportDeadlineHours,
        @DictionaryBinding("BD_MASTER_STATUS") String sdStatus,
        LocalDate effectiveFrom, LocalDate effectiveTo, List<MemberView> members
) {
    public record MemberView(Long conceptId, String code, String display, String systemName,
                             @DictionaryBinding("BD_DIAGNOSIS_DOMAIN") String sdDiagnosisDomain) {}
}
