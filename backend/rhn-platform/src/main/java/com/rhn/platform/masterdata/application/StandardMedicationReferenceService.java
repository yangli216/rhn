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
    @Override public CategoryReference requireCategory(String categoryKey) {
        var summary = catalog.summary(); return reference(summary, catalog.category(categoryKey));
    }
    @Override public java.util.List<CategoryReference> categoryCandidates(String name) {
        if (name == null || name.isBlank()) return java.util.List.of();
        String wanted = bare(name); var summary = catalog.summary();
        return catalog.categories("").stream().filter(c -> !wanted.isEmpty() && bare(StandardMedicationCatalogService.stripOrdinal(c.sub().isEmpty() ? c.major() : c.sub())).equals(wanted))
                .map(c -> reference(summary, c)).toList();
    }
    private static CategoryReference reference(tools.jackson.databind.JsonNode summary, StandardMedicationCatalogService.Category c) {
        return new CategoryReference(summary.path("catalogId").asString(), summary.path("catalogVersion").asString(),
                summary.path("contentHash").asString(), summary.path("source").path("sha256").asString(), c.key(), c.label(), c.entryIds());
    }
    private static String bare(String v) {
        String s = v.replaceAll("\\s+", "").replace("（", "(").replace("）", ")");
        s = s.replaceFirst("^\\([一二三四五六七八九十]+\\)", "").replaceFirst("^[一二三四五六七八九十]+、", "");
        return s;
    }
    @Override public Reference requireSpecification(String specificationId) {
        var spec = catalog.specification(specificationId); var summary = catalog.summary();
        return new Reference(summary.path("catalogId").asString(), summary.path("catalogVersion").asString(),
                summary.path("contentHash").asString(), summary.path("source").path("sha256").asString(),
                spec.path("entryId").asString(), specificationId, spec.path("name").asString(), spec.path("doseForm").asString(),
                spec.path("specification").asString());
    }
}
