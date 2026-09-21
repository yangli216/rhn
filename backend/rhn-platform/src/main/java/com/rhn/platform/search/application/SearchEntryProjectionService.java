package com.rhn.platform.search.application;

import com.rhn.platform.masterdata.domain.Medication;
import com.rhn.platform.masterdata.domain.MedicationProduct;
import com.rhn.platform.masterdata.domain.OrganizationCatalogItem;
import com.rhn.platform.masterdata.domain.ServiceCatalogItem;
import com.rhn.platform.masterdata.infrastructure.MedicationProductRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import com.rhn.platform.masterdata.infrastructure.OrganizationCatalogItemKey;
import com.rhn.platform.masterdata.infrastructure.OrganizationCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.platform.search.domain.SearchEntry;
import com.rhn.platform.search.infrastructure.SearchEntryRepository;
import com.rhn.platform.terminology.domain.CodeSystem;
import com.rhn.platform.terminology.domain.Concept;
import com.rhn.platform.terminology.domain.ConceptAlias;
import com.rhn.platform.terminology.domain.TerminologyStatus;
import com.rhn.platform.terminology.infrastructure.CodeSystemRepository;
import com.rhn.platform.terminology.infrastructure.ConceptAliasRepository;
import com.rhn.platform.terminology.infrastructure.ConceptRepository;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class SearchEntryProjectionService {
    private final SearchEntryRepository entries;
    private final SearchCodeGenerator generator;
    private final CodeSystemRepository codeSystems;
    private final ConceptRepository concepts;
    private final ConceptAliasRepository conceptAliases;
    private final MedicationRepository medications;
    private final MedicationProductRepository products;
    private final ServiceCatalogItemRepository services;
    private final OrganizationCatalogItemRepository adoptions;
    private final EntityManager entityManager;
    private final int rebuildBatchSize;
    private final ZoneId effectiveZone;

    public SearchEntryProjectionService(SearchEntryRepository entries, SearchCodeGenerator generator,
                                        CodeSystemRepository codeSystems, ConceptRepository concepts,
                                        ConceptAliasRepository conceptAliases, MedicationRepository medications,
                                        MedicationProductRepository products, ServiceCatalogItemRepository services,
                                        OrganizationCatalogItemRepository adoptions, EntityManager entityManager,
                                        @Value("${rhn.search.projection.rebuild-batch-size:500}") int rebuildBatchSize,
                                        @Value("${rhn.search.projection.effective-refresh-zone:Asia/Shanghai}")
                                        String effectiveZone) {
        this.entries = entries;
        this.generator = generator;
        this.codeSystems = codeSystems;
        this.concepts = concepts;
        this.conceptAliases = conceptAliases;
        this.medications = medications;
        this.products = products;
        this.services = services;
        this.adoptions = adoptions;
        this.entityManager = entityManager;
        this.rebuildBatchSize = Math.max(50, Math.min(rebuildBatchSize, 2000));
        this.effectiveZone = ZoneId.of(effectiveZone);
    }

    @Transactional
    public RebuildResult rebuildAll() {
        LocalDate at = currentDate();
        RebuildAccumulator result = new RebuildAccumulator();
        Map<Long, CodeSystem> systems = codeSystems.findAll().stream()
                .collect(Collectors.toMap(CodeSystem::id, Function.identity()));

        for (int page = 0; ; page++) {
            List<Concept> batch = concepts.findAll(batchPage(page)).getContent();
            if (batch.isEmpty()) break;
            Map<Long, List<ConceptAlias>> aliases = conceptAliases
                    .findByConceptIdIn(batch.stream().map(Concept::id).toList()).stream()
                    .collect(Collectors.groupingBy(ConceptAlias::conceptId));
            for (Concept concept : batch) {
                CodeSystem system = systems.get(concept.codeSystemId());
                if (system != null) result.add(synchronizeTarget(conceptSpecs(concept, system,
                                aliases.getOrDefault(concept.id(), List.of()), at), system.scopeType().name(),
                        system.scopeId(), "CONCEPT", concept.id(), null));
            }
            flushBatch();
            if (batch.size() < rebuildBatchSize) break;
        }

        for (int page = 0; ; page++) {
            List<Medication> batch = medications.findAll(batchPage(page)).getContent();
            if (batch.isEmpty()) break;
            batch.forEach(value -> result.add(synchronizeTarget(medicationSpecs(value), "TENANT",
                    value.tenantId(), "MEDICATION", value.id(), null)));
            flushBatch();
            if (batch.size() < rebuildBatchSize) break;
        }

        for (int page = 0; ; page++) {
            List<MedicationProduct> batch = products.findAllProducts(batchPage(page)).getContent();
            if (batch.isEmpty()) break;
            batch.forEach(value -> result.add(synchronizeTarget(productSpecs(value, at), "TENANT",
                    value.tenantId(), "CATALOG_ITEM", value.id(), null)));
            flushBatch();
            if (batch.size() < rebuildBatchSize) break;
        }

        for (int page = 0; ; page++) {
            List<ServiceCatalogItem> batch = services.findAllServices(batchPage(page)).getContent();
            if (batch.isEmpty()) break;
            batch.forEach(value -> result.add(synchronizeTarget(serviceSpecs(value, at), "TENANT",
                    value.tenantId(), "CATALOG_ITEM", value.id(), null)));
            flushBatch();
            if (batch.size() < rebuildBatchSize) break;
        }

        for (int page = 0; ; page++) {
            List<OrganizationCatalogItemKey> batch = adoptions.findDistinctSearchProjectionKeys(
                    PageRequest.of(page, rebuildBatchSize));
            if (batch.isEmpty()) break;
            for (OrganizationCatalogItemKey key : batch) {
                List<EntrySpec> desired = adoptionSpecs(adoptions
                        .findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                                key.tenantId(), key.organizationId(), key.catalogItemId()), at);
                result.add(synchronizeTarget(desired, "ORGANIZATION", key.organizationId(),
                        "CATALOG_ITEM", key.catalogItemId(), null));
            }
            flushBatch();
            if (batch.size() < rebuildBatchSize) break;
        }

        entries.flush();
        result.deleted += entries.deleteOrphanedConceptEntries();
        result.deleted += entries.deleteOrphanedMedicationEntries();
        result.deleted += entries.deleteOrphanedCatalogItemEntries();
        result.deleted += entries.deleteOrphanedOrganizationEntries();
        return result.toResult();
    }

    @Transactional
    public RebuildResult refreshEffectiveDateTransitions(LocalDate at) {
        LocalDate expiredOn = at.minusDays(1);
        RebuildAccumulator result = new RebuildAccumulator();
        Map<Long, CodeSystem> systems = codeSystems.findAll().stream()
                .collect(Collectors.toMap(CodeSystem::id, Function.identity()));

        for (int page = 0; ; page++) {
            List<Concept> batch = concepts.findSearchProjectionTransitions(at, expiredOn, batchPage(page)).getContent();
            if (batch.isEmpty()) break;
            Map<Long, List<ConceptAlias>> aliases = conceptAliases
                    .findByConceptIdIn(batch.stream().map(Concept::id).toList()).stream()
                    .collect(Collectors.groupingBy(ConceptAlias::conceptId));
            for (Concept concept : batch) {
                CodeSystem system = systems.get(concept.codeSystemId());
                if (system != null) result.add(synchronizeTarget(conceptSpecs(concept, system,
                                aliases.getOrDefault(concept.id(), List.of()), at), system.scopeType().name(),
                        system.scopeId(), "CONCEPT", concept.id(), null));
            }
            flushBatch();
            if (batch.size() < rebuildBatchSize) break;
        }

        for (int page = 0; ; page++) {
            List<MedicationProduct> batch = products
                    .findSearchProjectionTransitions(at, expiredOn, batchPage(page)).getContent();
            if (batch.isEmpty()) break;
            batch.forEach(value -> result.add(synchronizeTarget(productSpecs(value, at), "TENANT",
                    value.tenantId(), "CATALOG_ITEM", value.id(), null)));
            flushBatch();
            if (batch.size() < rebuildBatchSize) break;
        }

        for (int page = 0; ; page++) {
            List<ServiceCatalogItem> batch = services
                    .findSearchProjectionTransitions(at, expiredOn, batchPage(page)).getContent();
            if (batch.isEmpty()) break;
            batch.forEach(value -> result.add(synchronizeTarget(serviceSpecs(value, at), "TENANT",
                    value.tenantId(), "CATALOG_ITEM", value.id(), null)));
            flushBatch();
            if (batch.size() < rebuildBatchSize) break;
        }

        for (int page = 0; ; page++) {
            List<OrganizationCatalogItemKey> batch = adoptions.findSearchProjectionTransitionKeys(
                    at, expiredOn, PageRequest.of(page, rebuildBatchSize));
            if (batch.isEmpty()) break;
            for (OrganizationCatalogItemKey key : batch) {
                List<EntrySpec> desired = adoptionSpecs(adoptions
                        .findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                                key.tenantId(), key.organizationId(), key.catalogItemId()), at);
                result.add(synchronizeTarget(desired, "ORGANIZATION", key.organizationId(),
                        "CATALOG_ITEM", key.catalogItemId(), null));
            }
            flushBatch();
            if (batch.size() < rebuildBatchSize) break;
        }

        return result.toResult();
    }

    @Transactional
    public void synchronizeConcept(Concept concept, CodeSystem system, Collection<ConceptAlias> aliases, Long actorId) {
        synchronizeTarget(conceptSpecs(concept, system, aliases, currentDate()), system.scopeType().name(), system.scopeId(),
                "CONCEPT", concept.id(), actorId);
    }

    @Transactional
    public void synchronizeMedication(Medication medication, Long actorId) {
        synchronizeTarget(medicationSpecs(medication), "TENANT", medication.tenantId(),
                "MEDICATION", medication.id(), actorId);
    }

    @Transactional
    public void synchronizeProduct(MedicationProduct product, Long actorId) {
        synchronizeTarget(productSpecs(product, currentDate()), "TENANT", product.tenantId(),
                "CATALOG_ITEM", product.id(), actorId);
    }

    @Transactional
    public void synchronizeService(ServiceCatalogItem service, Long actorId) {
        synchronizeTarget(serviceSpecs(service, currentDate()), "TENANT", service.tenantId(),
                "CATALOG_ITEM", service.id(), actorId);
    }

    @Transactional
    public void synchronizeAdoption(OrganizationCatalogItem adoption, Long actorId) {
        synchronizeAdoptions(adoption.tenantId(), adoption.organizationId(), adoption.catalogItemId(), actorId);
    }

    @Transactional
    public void synchronizeAdoptions(Long tenantId, Long organizationId, Long catalogItemId, Long actorId) {
        List<EntrySpec> desired = adoptionSpecs(adoptions
                .findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                        tenantId, organizationId, catalogItemId), currentDate());
        synchronizeTarget(desired, "ORGANIZATION", organizationId, "CATALOG_ITEM", catalogItemId, actorId);
    }

    private SyncResult synchronizeTarget(List<EntrySpec> desired, String scopeType, Long scopeId,
                                         String targetType, Long targetId, Long actorId) {
        Map<EntryKey, SearchEntry> existing = entries
                .findByScopeTypeAndScopeIdAndTargetTypeAndTargetId(scopeType, scopeId, targetType, targetId).stream()
                .collect(Collectors.toMap(EntryKey::of, Function.identity()));
        Set<EntryKey> retained = new HashSet<>();
        int created = 0;
        for (EntrySpec spec : desired) {
            EntryKey key = spec.key();
            retained.add(key);
            SearchCodeGenerator.GeneratedCodes codes = generator.generate(spec.name());
            SearchEntry entry = existing.get(key);
            if (entry == null) {
                entry = new SearchEntry(spec.scopeType(), spec.scopeId(), spec.tenantId(), spec.targetType(),
                        spec.targetId(), spec.nameType(), spec.sourceKey(), codes.normalizedName(), codes.pinyin(),
                        codes.wubi(), spec.mnemonic(), spec.primary(), codes.generatorVersion(), spec.status(), actorId);
                created++;
            } else {
                entry.synchronize(codes.normalizedName(), codes.pinyin(), codes.wubi(), spec.mnemonic(),
                        spec.primary(), codes.generatorVersion(), spec.status(), actorId);
            }
            entries.save(entry);
        }
        List<SearchEntry> obsolete = existing.entrySet().stream()
                .filter(value -> !retained.contains(value.getKey())).map(Map.Entry::getValue).toList();
        if (!obsolete.isEmpty()) entries.deleteAllInBatch(obsolete);
        return new SyncResult(desired.size(), created, desired.size() - created, obsolete.size());
    }

    private PageRequest batchPage(int page) {
        return PageRequest.of(page, rebuildBatchSize, Sort.by("id").ascending());
    }

    LocalDate currentDate() {
        return LocalDate.now(effectiveZone);
    }

    private void flushBatch() {
        entries.flush();
        entityManager.clear();
    }

    private List<EntrySpec> conceptSpecs(Concept concept, CodeSystem system, Collection<ConceptAlias> aliases,
                                         LocalDate at) {
        Long tenantId = "TENANT".equals(system.scopeType().name()) ? system.scopeId() : null;
        String status = concept.status() == TerminologyStatus.ACTIVE && concept.isEffectiveAt(at)
                ? "ACTIVE" : "INACTIVE";
        List<EntrySpec> result = new ArrayList<>();
        add(result, system.scopeType().name(), system.scopeId(), tenantId, "CONCEPT", concept.id(),
                "CANONICAL", "CONCEPT:DISPLAY", concept.display(), concept.searchCode(), true, status);
        add(result, system.scopeType().name(), system.scopeId(), tenantId, "CONCEPT", concept.id(),
                "SHORT_NAME", "CONCEPT:SHORT", concept.shortDisplay(), null, false, status);
        for (ConceptAlias alias : aliases) {
            add(result, system.scopeType().name(), system.scopeId(), tenantId, "CONCEPT", concept.id(),
                    "ALIAS", "CONCEPT_ALIAS:" + alias.id(), alias.aliasName(), alias.searchCode(), false,
                    alias.status() == TerminologyStatus.ACTIVE && "ACTIVE".equals(status) ? "ACTIVE" : "INACTIVE");
        }
        return result;
    }

    private List<EntrySpec> medicationSpecs(Medication value) {
        List<EntrySpec> result = new ArrayList<>();
        String status = active(value.status());
        add(result, "TENANT", value.tenantId(), value.tenantId(), "MEDICATION", value.id(), "CANONICAL",
                "MEDICATION:NAME", value.name(), null, true, status);
        add(result, "TENANT", value.tenantId(), value.tenantId(), "MEDICATION", value.id(), "ALIAS",
                "MEDICATION:ALIAS", value.aliasName(), null, false, status);
        return result;
    }

    private List<EntrySpec> productSpecs(MedicationProduct value, LocalDate at) {
        List<EntrySpec> result = new ArrayList<>();
        String status = activeAt(value.status(), value.validFrom(), value.validTo(), at);
        add(result, "TENANT", value.tenantId(), value.tenantId(), "CATALOG_ITEM", value.id(), "CANONICAL",
                "CATALOG_ITEM:NAME", value.name(), null, true, status);
        add(result, "TENANT", value.tenantId(), value.tenantId(), "CATALOG_ITEM", value.id(), "TRADE_NAME",
                "MED_PRODUCT:TRADE", value.tradeName(), null, false, status);
        return result;
    }

    private List<EntrySpec> serviceSpecs(ServiceCatalogItem value, LocalDate at) {
        List<EntrySpec> result = new ArrayList<>();
        add(result, "TENANT", value.tenantId(), value.tenantId(), "CATALOG_ITEM", value.id(), "CANONICAL",
                "CATALOG_ITEM:NAME", value.name(), null, true,
                activeAt(value.status(), value.validFrom(), value.validTo(), at));
        return result;
    }

    private List<EntrySpec> adoptionSpecs(Collection<OrganizationCatalogItem> history, LocalDate at) {
        List<EntrySpec> result = new ArrayList<>();
        OrganizationCatalogItem value = history.stream()
                .filter(candidate -> candidate.overlaps(at, at))
                .max(Comparator.comparing(OrganizationCatalogItem::validFrom))
                .orElse(null);
        if (value == null || !value.effectiveAt(at)) return result;
        add(result, "ORGANIZATION", value.organizationId(), value.tenantId(), "CATALOG_ITEM",
                value.catalogItemId(), "LOCAL_NAME", "ORG_CATALOG_ITEM:CURRENT", value.localName(), null,
                false, "ACTIVE");
        return result;
    }

    private void add(List<EntrySpec> target, String scopeType, Long scopeId, Long tenantId, String targetType,
                     Long targetId, String nameType, String sourceKey, String name, String mnemonic,
                     boolean primary, String status) {
        if (!"ACTIVE".equals(status) || name == null || name.isBlank()) return;
        target.add(new EntrySpec(scopeType, scopeId, tenantId, targetType, targetId, nameType, sourceKey,
                name, mnemonic == null || mnemonic.isBlank() ? null : generator.normalizeQuery(mnemonic),
                primary, status));
    }

    private String active(String status) {
        return "ACTIVE".equals(status) ? "ACTIVE" : "INACTIVE";
    }

    private String activeAt(String status, LocalDate validFrom, LocalDate validTo, LocalDate at) {
        return "ACTIVE".equals(status) && !validFrom.isAfter(at) && (validTo == null || !validTo.isBefore(at))
                ? "ACTIVE" : "INACTIVE";
    }

    public record RebuildResult(int desired, int created, int updated, int deleted) {}

    private record SyncResult(int desired, int created, int updated, int deleted) {}

    private static final class RebuildAccumulator {
        private int desired;
        private int created;
        private int updated;
        private int deleted;

        private void add(SyncResult value) {
            desired += value.desired();
            created += value.created();
            updated += value.updated();
            deleted += value.deleted();
        }

        private RebuildResult toResult() {
            return new RebuildResult(desired, created, updated, deleted);
        }
    }

    private record EntrySpec(String scopeType, Long scopeId, Long tenantId, String targetType, Long targetId,
                             String nameType, String sourceKey, String name, String mnemonic,
                             boolean primary, String status) {
        EntryKey key() { return new EntryKey(scopeType, scopeId, targetType, targetId, sourceKey); }
    }

    private record EntryKey(String scopeType, Long scopeId, String targetType, Long targetId, String sourceKey) {
        static EntryKey of(SearchEntry entry) {
            return new EntryKey(entry.scopeType(), entry.scopeId(), entry.targetType(), entry.targetId(),
                    entry.sourceKey());
        }
    }
}
