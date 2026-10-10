package com.rhn.quality.medication.api;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;

public final class MedicationSafetyCategoryContracts {
    private MedicationSafetyCategoryContracts() {}

    @Schema(name = "MedicationSafetyCategoryView")
    public record CategoryView(
            Long id,
            String code,
            String name,
            String ruleKind,
            String rationale,
            boolean isSystem,
            String status,
            int memberCount,
            int revision,
            Instant createdAt,
            Instant updatedAt,
            String catalogMajor,
            String catalogSub,
            boolean systemicOnly
    ) {}

    @Schema(name = "MedicationSafetyCreateCategoryRequest")
    public record CreateCategoryRequest(
            String code,
            String name,
            String ruleKind,
            String rationale,
            String catalogMajor,
            String catalogSub,
            Boolean systemicOnly
    ) {
        public CreateCategoryRequest(String code, String name, String ruleKind, String rationale) {
            this(code, name, ruleKind, rationale, null, null, false);
        }
    }

    @Schema(name = "MedicationSafetyUpdateCategoryRequest")
    public record UpdateCategoryRequest(
            int expectedRevision,
            String name,
            String rationale,
            String status,
            String catalogMajor,
            String catalogSub,
            Boolean systemicOnly
    ) {
        public UpdateCategoryRequest(int expectedRevision, String name, String rationale, String status) {
            this(expectedRevision, name, rationale, status, null, null, false);
        }
    }

    @Schema(name = "MedicationSafetyMemberView")
    public record MemberView(
            Long id,
            Long categoryId,
            Long medicationId,
            String medicationCode,
            String medicationName,
            String preparationSpec,
            @com.rhn.platform.dictionary.api.DictionaryBinding(com.rhn.platform.masterdata.api.MasterDataDictionaryCodes.DOSE_FORM) String doseForm,
            Instant createdAt,
            boolean inherited
    ) {}

    @Schema(name = "MedicationSafetyMemberItem")
    public record MemberItem(
            Long medicationId,
            String medicationCode,
            String medicationName,
            String preparationSpec,
            @com.rhn.platform.dictionary.api.DictionaryBinding(com.rhn.platform.masterdata.api.MasterDataDictionaryCodes.DOSE_FORM) String doseForm
    ) {}

    @Schema(name = "MedicationSafetyAddMembersRequest")
    public record AddMembersRequest(
            List<MemberItem> items
    ) {
        public AddMembersRequest {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    @Schema(name = "MedicationSafetyStandardCatalogCategorySummary")
    public record StandardCatalogCategorySummary(
            String major,
            String sub,
            int entryCount,
            List<String> entryNames
    ) {}

    @Schema(name = "MedicationSafetyCatalogImportRequest")
    public record CatalogImportRequest(
            String catalogMajor,
            String catalogSub,
            Boolean systemicOnly
    ) {}

    @Schema(name = "MedicationSafetyCatalogImportResult")
    public record CatalogImportResult(
            int importedCount,
            int skippedCount,
            int totalCount
    ) {}

    @Schema(name = "MedicationSafetyMedicationTagView")
    public record MedicationTagView(
            Long categoryId,
            String categoryCode,
            String categoryName,
            String ruleKind,
            String rationale
    ) {}
}
