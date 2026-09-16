package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
@Transactional(readOnly = true)
public class MedicationKnowledgeService implements MedicationKnowledgeDirectory {
    private final MedicationRepository medications;
    private final CatalogLifecycleDirectory catalog;
    private final MedicationTerminologyDirectory terminology;
    private final ItemStandardMappingDirectory mappings;
    private final ExecutionContextProvider contexts;
    public MedicationKnowledgeService(MedicationRepository medications, CatalogLifecycleDirectory catalog,
            MedicationTerminologyDirectory terminology, ItemStandardMappingDirectory mappings, ExecutionContextProvider contexts) {
        this.medications=medications; this.catalog=catalog; this.terminology=terminology; this.mappings=mappings; this.contexts=contexts;
    }
    public List<Knowledge> search(String query) {
        return medications.search(contexts.requireCurrent().tenantId(), query, null, "ACTIVE", PageRequest.of(0, 40))
                .stream().map(m -> require(m.id())).toList();
    }
    public Knowledge require(Long id) {
        var tenant=contexts.requireCurrent().tenantId();
        var entity=medications.findByIdAndTenantId(id, tenant)
                .filter(m -> "ACTIVE".equals(m.status()))
                .orElseThrow(() -> notFound("QMED_MEDICATION_NOT_FOUND", "药品不存在、已停用或不属于当前租户"));
        var allergens=terminology.allergenConceptIds(tenant, List.of(id)).getOrDefault(id, List.of()).stream()
                .flatMap(a -> terminology.findAllergen(tenant, a).stream()).toList();
        return new Knowledge(catalog.requireMedication(tenant, id), entity.revision(), "LEGACY", Instant.now(),
                terminology.classifications(tenant, List.of(id)).getOrDefault(id, List.of()), allergens,
                mappings.resolve(tenant, "MEDICATION", id, null, LocalDate.now()));
    }
}
