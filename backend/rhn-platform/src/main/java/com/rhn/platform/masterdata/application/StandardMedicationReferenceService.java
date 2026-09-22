package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory;
import org.springframework.stereotype.Service;

@Service
public class StandardMedicationReferenceService implements StandardMedicationReferenceDirectory {
    private final StandardMedicationCatalogService catalog;
    public StandardMedicationReferenceService(StandardMedicationCatalogService catalog) { this.catalog = catalog; }
    @Override public java.util.List<Reference> exactNameCandidates(String name) {
        if (name == null || name.isBlank()) return java.util.List.of();
        return catalog.identityCandidates("", name, name).stream()
                .map(spec -> requireSpecification(spec.path("id").asString())).toList();
    }
    @Override public Reference requireSpecification(String specificationId) {
        var spec = catalog.specification(specificationId); var summary = catalog.summary();
        return new Reference(summary.path("catalogId").asString(), summary.path("catalogVersion").asString(),
                summary.path("contentHash").asString(), summary.path("source").path("sha256").asString(),
                spec.path("entryId").asString(), specificationId, spec.path("name").asString(), spec.path("doseForm").asString(),
                spec.path("specification").asString());
    }
}
