package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentRecommendation;
import com.rhn.platform.masterdata.api.MasterDataViews.ServiceView;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

/** Exact matching remains deterministic; ambiguous investigation names are judged together. */
@Service
public class PlanInvestigationDecisionService {
    private final ServiceCatalogDirectory catalog;
    private final TreatmentCatalogDecisionService decisions;

    public PlanInvestigationDecisionService(ServiceCatalogDirectory catalog, TreatmentCatalogDecisionService decisions) {
        this.catalog = catalog;
        this.decisions = decisions;
    }
    public record Intent(String type, String name) {
        public String key() { return type + "|" + name; }
    }
    public record Resolution(ServiceView item, String detail, int exactCount) { }

    public Map<String, Resolution> resolve(List<Intent> intents, ExecutionContext context, LocalDate today) {
        var resolved = new LinkedHashMap<String, Resolution>();
        var groups = new ArrayList<TreatmentCatalogDecisionService.Group>();
        var pending = new ArrayList<Intent>();
        var candidatesByGroup = new ArrayList<List<ServiceView>>();
        boolean enabled = decisions.enabled(DecisionScene.PLAN_COMPILATION, context);
        for (var intent : intents) {
            if (resolved.containsKey(intent.key())) continue;
            var found = catalog.searchOrderableServices(intent.name(), intent.type(), context.organizationId(), today);
            var exact = found.stream().filter(item -> exact(intent.name(), item)).toList();
            resolved.put(intent.key(), new Resolution(exact.size() == 1 ? exact.getFirst() : null, "", exact.size()));
            if (exact.size() == 1 || !enabled) continue;
            // A suffix may prevent full-name lookup from recalling the corresponding catalog entry.
            if (found.isEmpty()) {
                String query = intent.name().replaceFirst("(?:检查|检测|化验|检验)$", "").trim();
                if (query.length() >= 2 && !query.equals(intent.name())) {
                    found = catalog.searchOrderableServices(query, intent.type(), context.organizationId(), today);
                }
                if (found.isEmpty() && !intent.name().endsWith("测定")) {
                    found = catalog.searchOrderableServices(intent.name() + "测定", intent.type(), context.organizationId(), today);
                }
                exact = found.stream().filter(item -> exact(intent.name(), item)).toList();
                if (exact.size() == 1) {
                    resolved.put(intent.key(), new Resolution(exact.getFirst(), "", 1));
                    continue;
                }
            }
            var unique = new LinkedHashMap<Long, ServiceView>();
            (exact.isEmpty() ? found : exact).stream().filter(item -> intent.type().equals(item.sdServiceType()))
                    .forEach(item -> unique.putIfAbsent(item.id(), item));
            if (unique.isEmpty()) continue;
            if (unique.size() > 64) {
                resolved.put(intent.key(), new Resolution(null, "候选范围过大，保留人工核对", exact.size()));
                continue;
            }
            var candidates = List.copyOf(unique.values());
            pending.add(intent); candidatesByGroup.add(candidates);
            groups.add(new TreatmentCatalogDecisionService.Group(
                    new TreatmentRecommendation(intent.type(), null, null, null, intent.name(), null, null),
                    candidates.stream().map(item -> new TreatmentRecommendation(intent.type(), item.id(), null,
                            item.code(), item.name(), null, null)).toList()));
        }
        if (groups.isEmpty()) return resolved;
        var attempt = decisions.match(groups, context, DecisionScene.PLAN_COMPILATION);
        decisions.compare(attempt, List.of(), context, DecisionScene.PLAN_COMPILATION);
        String detail = attempt.alerts().stream().map(alert -> alert.detail()).findFirst().orElse("");
        for (int index = 0; index < pending.size(); index++) {
            var intent = pending.get(index);
            ServiceView selected = null;
            if (attempt.applied() && attempt.raw() != null) {
                var answer = attempt.raw().answers().get("intent_" + index);
                if (answer != null) selected = candidatesByGroup.get(index).stream()
                        .filter(item -> (intent.type() + "|" + item.id()).equals(answer.choice())).findFirst().orElse(null);
            }
            resolved.put(intent.key(), new Resolution(selected, detail, resolved.get(intent.key()).exactCount()));
        }
        return resolved;
    }

    private boolean exact(String name, ServiceView item) {
        if (name.equalsIgnoreCase(item.code()) || matchesExactOrAssay(name, item.name())) return true;
        var adoption = item.organizationAdoption();
        return adoption != null && (name.equalsIgnoreCase(adoption.localCode()) || matchesExactOrAssay(name, adoption.localName()));
    }

    private boolean matchesExactOrAssay(String name, String catalogName) {
        if (catalogName == null) return false;
        if (name.equalsIgnoreCase(catalogName)) return true;
        if ((name + "测定").equalsIgnoreCase(catalogName)) return true;
        if (name.endsWith("测定") && name.substring(0, name.length() - 2).equalsIgnoreCase(catalogName)) return true;
        return false;
    }
}
