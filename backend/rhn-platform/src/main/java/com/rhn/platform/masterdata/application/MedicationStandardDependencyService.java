package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory;
import com.rhn.platform.masterdata.infrastructure.*;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.util.stream.Collectors;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
@Transactional(readOnly = true)
public class MedicationStandardDependencyService implements MedicationStandardDependencyDirectory {
    private final MedicationStandardSourceRepository sources;
    private final MedicationRepository medications;
    private final MedicationProductRepository products;
    private final ExecutionContextProvider contexts;
    private final ClinicalSemanticHistory history;
    private final com.rhn.shared.json.JsonCodec json;
    public MedicationStandardDependencyService(MedicationStandardSourceRepository sources, MedicationRepository medications,
            MedicationProductRepository products, ExecutionContextProvider contexts, ClinicalSemanticHistory history, com.rhn.shared.json.JsonCodec json) {
        this.sources = sources; this.medications = medications; this.products = products; this.contexts = contexts; this.history = history; this.json = json;
    }
    @Override public Snapshot inspect(Scope scope) { return inspect(scope, true); }
    @Override public Snapshot inspectDependencies(Scope scope) { return inspect(scope, false); }
    private Snapshot inspect(Scope scope, boolean includeRevisions) {
        var c = contexts.requireCurrent();
        if (!c.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("STANDARD_DEPENDENCY_FORBIDDEN", "需要药品主数据管理权限");
        if (scope == null || scope.catalogId() == null || scope.catalogId().isBlank() || scope.catalogId().length() > 128
                || scope.entryId() != null && (scope.entryId().isBlank() || scope.entryId().length() > 128)
                || scope.specificationId() != null && (scope.specificationId().isBlank() || scope.specificationId().length() > 128 || scope.entryId() == null))
            throw badRequest("STANDARD_DEPENDENCY_SCOPE", "请指定目录；查询规格时同时指定所属标准条目");
        var selected = sources.findByTenantId(c.tenantId()).stream().filter(s -> scope.catalogId().equals(s.catalogCode())
                && (scope.entryId() == null || scope.entryId().equals(s.entryCode()))
                && (scope.specificationId() == null || scope.specificationId().equals(s.specificationCode()))).toList();
        var revisions = includeRevisions ? revisions(c.tenantId(), scope) : List.<Revision>of();
        if (selected.isEmpty()) return new Snapshot(scope, List.of(), List.of(), revisions);
        var ids = selected.stream().map(s -> s.medicationId()).distinct().toList();
        var indexed = medications.findByTenantIdAndIdIn(c.tenantId(), ids).stream().collect(Collectors.toMap(m -> m.id(), m -> m));
        var grouped = selected.stream().collect(Collectors.groupingBy(s -> s.medicationId(), TreeMap::new, Collectors.toList()));
        var meds = grouped.entrySet().stream().map(entry -> {
            var med = indexed.get(entry.getKey());
            var refs = entry.getValue().stream().map(s -> new Reference(s.catalogCode(), s.catalogVersion(), s.entryCode(), s.specificationCode(), s.sourceHash())).distinct().sorted(Comparator.comparing(Reference::catalogId).thenComparing(Reference::catalogVersion).thenComparing(Reference::entryId).thenComparing(Reference::specificationId).thenComparing(Reference::contentHash)).toList();
            return new Medication(entry.getKey(), med == null ? "" : med.code(), med == null ? "药品档案已缺失" : med.name(), med == null ? "MISSING" : med.status(), med == null ? null : med.revision(), refs);
        }).toList();
        var prods = products.findByTenantIdAndMedicationIdIn(c.tenantId(), ids).stream().sorted(Comparator.comparing(p -> p.id()))
                .map(p -> new Product(p.id(), p.medicationId(), p.code(), p.name(), p.status(), p.revision())).toList();
        return new Snapshot(scope, meds, prods, revisions);
    }
    private List<Revision> revisions(Long tenant, Scope scope) {
        var seen = new HashSet<Long>(); var result = new ArrayList<Revision>();
        for (var stored : history.eventsOfKind(tenant,"STANDARD_REVISION")) {
            var event = json.read(stored.snapshot(),com.rhn.platform.masterdata.api.MedicationStandardRevisionContracts.Event.class);
            var proposal = event.proposal();
            boolean latest = seen.add(proposal.medicationId());
            var before = proposal.previousLinks().stream().map(this::reference).filter(r->matches(scope,r)).toList();
            var after = event.resultingLinks().stream().map(this::reference).filter(r->matches(scope,r)).toList();
            var target = new Reference(proposal.identity().catalogId(),proposal.identity().catalogVersion(),proposal.target().path("entryId").asString(),proposal.specificationId(),proposal.identity().contentHash());
            if (!matches(scope,target)) target = null;
            if (!before.isEmpty() || !after.isEmpty() || target != null)
                result.add(new Revision(event.id(),proposal.medicationId(),proposal.medication().path("name").asString(),event.status(),!latest || !"SUBMITTED".equals(event.status()),event.actor(),event.recordedAt(),before,target,after));
        }
        return List.copyOf(result);
    }
    private Reference reference(com.rhn.platform.masterdata.api.MedicationStandardRevisionContracts.SourceLink link) {
        return new Reference(link.catalogId(),link.catalogVersion(),link.entryId(),link.specificationId(),link.contentHash());
    }
    private boolean matches(Scope scope,Reference reference) {
        return scope.catalogId().equals(reference.catalogId()) && (scope.entryId()==null || scope.entryId().equals(reference.entryId()))
                && (scope.specificationId()==null || scope.specificationId().equals(reference.specificationId()));
    }

}
