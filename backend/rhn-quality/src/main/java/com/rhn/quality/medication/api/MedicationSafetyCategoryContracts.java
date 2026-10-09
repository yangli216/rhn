package com.rhn.quality.medication.api;

import java.time.Instant;
import java.util.List;

public final class MedicationSafetyCategoryContracts {
    private MedicationSafetyCategoryContracts() {}

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

    public record MemberView(
            Long id,
            Long categoryId,
            Long medicationId,
            String medicationCode,
            String medicationName,
            String preparationSpec,
            String doseForm,
            Instant createdAt,
            boolean inherited
    ) {}

    public record MemberItem(
            Long medicationId,
            String medicationCode,
            String medicationName,
            String preparationSpec,
            String doseForm
    ) {}

    public record AddMembersRequest(
            List<MemberItem> items
    ) {
        public AddMembersRequest {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    public record StandardCatalogCategorySummary(
            String major,
            String sub,
            int entryCount,
            List<String> entryNames
    ) {}

    public record CatalogImportRequest(
            String catalogMajor,
            String catalogSub,
            Boolean systemicOnly
    ) {}

    public record CatalogImportResult(
            int importedCount,
            int skippedCount,
            int totalCount
    ) {}

    public record MedicationTagView(
            Long categoryId,
            String categoryCode,
            String categoryName,
            String ruleKind,
            String rationale
    ) {}
}
