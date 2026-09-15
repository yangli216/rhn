package com.rhn.platform.terminology.api;

import java.util.List;

/** Authoritative terminology and disease-management snapshot used when a diagnosis fact is recorded. */
public record DiseaseReferenceSnapshot(
        Long conceptId, String systemCode, String systemUri, String systemVersion,
        String diagnosisDomain, String code, String display, List<DiseaseManagementSnapshot> managementPrograms
) {
    public record DiseaseManagementSnapshot(
            Long id, String code, String name, String managementType, String triggerAction,
            String reportCardType, Integer reportDeadlineHours) {}
}
