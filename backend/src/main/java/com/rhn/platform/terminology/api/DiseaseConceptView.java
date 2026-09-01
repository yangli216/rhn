package com.rhn.platform.terminology.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.time.LocalDate;
import java.util.List;

public record DiseaseConceptView(
        Long id, long revision, Long codeSystemId, String systemCode, String systemName,
        String systemVersion,
        @DictionaryBinding("BD_DIAGNOSIS_DOMAIN") String sdDiagnosisDomain,
        String code, String display, String shortDisplay,
        @DictionaryBinding("BD_CONCEPT_TYPE") String sdConceptType,
        String chapterCode, String chapterName, String definition, String searchCode,
        @DictionaryBinding("BD_MASTER_STATUS") String sdStatus,
        LocalDate effectiveFrom, LocalDate effectiveTo, Long replacementConceptId,
        List<ConceptAliasView> aliases, List<DiseaseManagementTagView> managementPrograms
) {}
