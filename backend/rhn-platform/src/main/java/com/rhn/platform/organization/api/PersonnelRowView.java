package com.rhn.platform.organization.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

/**
 * One row of the personnel list. The primary assignment is today's active primary assignment, or the first
 * active assignment when none is marked primary; null when the person currently holds no assignment.
 */
public record PersonnelRowView(
        Long practitionerId, long revision, String code, String fullName, String sdPractGender, String sdPersonnelStatus,
        PrimaryAssignment primaryAssignment, int currentAssignmentCount,
        boolean qualificationRegistered,
        @DictionaryBinding("PRACT_PROF_TITLE") String sdProfessionalTitle,
        @DictionaryBinding("PRACT_CATEGORY") String sdPracticeCategory,
        boolean prescribing, boolean narcoticPrescribing,
        @DictionaryBinding("BD_ANTIMICROBIAL_LEVEL") String sdAntimicrobialLevel
) {
    public record PrimaryAssignment(Long assignmentId, Long organizationId, String organizationName,
                                    Long departmentId, String departmentName, Long positionId, String positionName,
                                    String sdPositionType) {}
}
