package com.rhn.platform.masterdata.api;

import java.util.List;

public final class StandardMedicationCatalogContracts {
    private StandardMedicationCatalogContracts() {}

    public record MedicationRecord(Long id, String code, String name, String specification,
            String status, int productCount, String relationType) {}
    public record SpecificationMedicationUsage(String specificationId, List<MedicationRecord> records) {}
    public record EntryMedicationUsage(String entryId, List<SpecificationMedicationUsage> specifications) {}
}
