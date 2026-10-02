package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentRecommendation;
import com.rhn.platform.masterdata.api.ItemAliasDirectory;
import com.rhn.platform.masterdata.api.ItemGroupDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews.ServiceView;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.*;

/** Exact matching remains deterministic; ambiguous investigation names are judged together. */
@Service
public class PlanInvestigationDecisionService {
    private final ServiceCatalogDirectory catalog;
    private final TreatmentCatalogDecisionService decisions;
    private final ItemAliasDirectory aliases;
    private final ItemGroupDirectory itemGroups;

    @Autowired
    public PlanInvestigationDecisionService(ServiceCatalogDirectory catalog, TreatmentCatalogDecisionService decisions,
                                            ItemAliasDirectory aliases, ItemGroupDirectory itemGroups) {
        this.catalog = catalog;
        this.decisions = decisions;
        this.aliases = aliases;
        this.itemGroups = itemGroups;
    }

    public PlanInvestigationDecisionService(ServiceCatalogDirectory catalog, TreatmentCatalogDecisionService decisions) {
        this(catalog, decisions, null, null);
    }
    public record Intent(String type, String name) {
        public String key() { return type + "|" + name; }
    }
    public record ResolvedItem(Long id, String code, String name, String serviceType, BigDecimal quantity, String unitCode) {}
    public record Resolution(ServiceView item, List<ResolvedItem> items, String detail, int exactCount,
                             String matchType) {
        public boolean groupMatch() { return "GROUP".equals(matchType); }
    }

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
            if (exact.size() == 1) {
                ServiceView item = exact.getFirst();
                resolved.put(intent.key(), new Resolution(item, List.of(toResolved(item)), "", 1, "EXACT"));
                continue;
            }
            resolved.put(intent.key(), new Resolution(null, List.of(), "", exact.size(), ""));
            if (exact.size() > 1) continue;
            if (aliases != null) {
                var aliasIds = aliases.findActiveServiceIdsByAlias(context.tenantId(), intent.name());
                var aliasMatches = found.stream().filter(item -> aliasIds.contains(item.id())).toList();
                if (aliasMatches.isEmpty() && !aliasIds.isEmpty()) {
                    aliasMatches = catalog.findOrderableServicesByIds(aliasIds, context.organizationId(), today);
                }
                if (aliasMatches.size() == 1) {
                    ServiceView item = aliasMatches.getFirst();
                    resolved.put(intent.key(), new Resolution(item, List.of(toResolved(item)),
                            "已通过项目别名匹配院内目录", 0, "ALIAS"));
                    continue;
                }
            }
            if (itemGroups != null) {
                String baseName = baseName(intent.name());
                var candidates = itemGroups.searchOrderableGroups(context.tenantId(), context.organizationId(),
                        intent.type(), baseName, today).stream()
                        .filter(group -> hintsCovered(group, intent.name())).toList();
                if (candidates.size() == 1) {
                    var group = candidates.getFirst();
                    var items = group.members().stream()
                            .map(member -> new ResolvedItem(member.catalogItemId(), member.code(), member.name(),
                                    member.serviceType(), member.quantity(), member.unitCode())).toList();
                    resolved.put(intent.key(), new Resolution(null, items,
                            "已匹配项目组套“" + group.name() + "”，将按组套成员展开", 0, "GROUP"));
                    continue;
                }
            }
            if (!enabled) continue;
            // A suffix may prevent full-name lookup from recalling the corresponding catalog entry.
            if (found.isEmpty()) {
                String query = intent.name().replaceFirst("(?:检查|检测|化验|检验)$", "").trim();
                if (query.length() >= 2 && !query.equals(intent.name())) {
                    found = catalog.searchOrderableServices(query, intent.type(), context.organizationId(), today);
                }
                if (found.isEmpty() && !intent.name().endsWith("测定")) {
                    found = catalog.searchOrderableServices(intent.name() + "测定", intent.type(), context.organizationId(), today);
                }
                if (found.isEmpty() && "EXAMINATION".equals(intent.type())) {
                    found = expandExaminationCandidates(intent.name(), context.organizationId(), today);
                }
                exact = found.stream().filter(item -> exact(intent.name(), item)).toList();
                if (exact.size() == 1) {
                    resolved.put(intent.key(), new Resolution(exact.getFirst(), List.of(toResolved(exact.getFirst())), "", 1, "EXACT"));
                    continue;
                }
            }
            var unique = new LinkedHashMap<Long, ServiceView>();
            (exact.isEmpty() ? found : exact).stream().filter(item -> intent.type().equals(item.sdServiceType()))
                    .forEach(item -> unique.putIfAbsent(item.id(), item));
            if (unique.isEmpty()) continue;
            if (unique.size() > 64) {
                resolved.put(intent.key(), new Resolution(null, List.of(), "候选范围过大，保留人工核对", exact.size(), ""));
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
            resolved.put(intent.key(), new Resolution(selected,
                    selected == null ? List.of() : List.of(toResolved(selected)), detail,
                    resolved.get(intent.key()).exactCount(), selected == null ? "" : "DECISION"));
        }
        return resolved;
    }

    private ResolvedItem toResolved(ServiceView item) {
        return new ResolvedItem(item.id(), item.code(), item.name(), item.sdServiceType(), BigDecimal.ONE, item.unitCode());
    }

    private String baseName(String value) {
        if (value == null) return "";
        return value.replaceFirst("[（(].*?[）)]", "").trim();
    }

    private boolean hintsCovered(ItemGroupDirectory.ItemGroupSnapshot group, String value) {
        int open = value == null ? -1 : Math.max(value.indexOf('（'), value.indexOf('('));
        if (open < 0) return true;
        int close = value.indexOf('）', open);
        if (close < 0) close = value.indexOf(')', open);
        if (close <= open) return true;
        String hintText = value.substring(open + 1, close);
        return Arrays.stream(hintText.split("[,，、;；]")).map(String::trim)
                .map(hint -> hint.replaceFirst("^含", "")).filter(s -> !s.isBlank())
                .allMatch(hint -> group.members().stream().anyMatch(member ->
                        containsHint(member.name(), hint) || containsHint(hint, member.name())
                                || member.code().equalsIgnoreCase(hint)));
    }

    private boolean containsHint(String value, String hint) {
        if (value == null || hint == null) return false;
        String normalizedValue = normalizeHint(value);
        String normalizedHint = normalizeHint(hint);
        return !normalizedValue.isBlank() && !normalizedHint.isBlank() && normalizedValue.contains(normalizedHint);
    }

    private String normalizeHint(String value) {
        return value.replaceFirst("^血清", "血")
                .replaceFirst("(测定|检查|检测|检验|项目)$", "")
                .trim();
    }

    private boolean exact(String name, ServiceView item) {
        if (name.equalsIgnoreCase(item.code()) || matchesExactOrAssay(name, item.name())) return true;
        var adoption = item.organizationAdoption();
        return adoption != null && (name.equalsIgnoreCase(adoption.localCode()) || matchesExactOrAssay(name, adoption.localName()));
    }

    private List<ServiceView> expandExaminationCandidates(String intentName, Long organizationId, LocalDate today) {
        if (intentName == null || intentName.isBlank()) return List.of();
        String transformed = intentName
                .replace("摄片", "摄影")
                .replace("X光", "X线")
                .replace("平片", "摄影");
        if (!transformed.equals(intentName)) {
            var direct = catalog.searchOrderableServices(transformed, "EXAMINATION", organizationId, today);
            if (!direct.isEmpty()) return direct;
        }

        for (String site : List.of("胸部", "腹部", "头颅", "颅脑", "盆腔", "颈部", "腰椎", "胸椎", "颈椎",
                "骨盆", "双肺", "肺部", "膝关节", "肩关节", "肘关节", "腕关节", "髋关节", "踝关节", "心脏", "乳腺", "甲状腺")) {
            if (intentName.contains(site)) {
                var siteCandidates = catalog.searchOrderableServices(site, "EXAMINATION", organizationId, today);
                if (siteCandidates.isEmpty()) continue;
                boolean isRadiology = intentName.matches(".*(?:X线|X光|摄片|摄影|DR|CR|透视|平片|拍片).*");
                if (isRadiology) {
                    var filtered = siteCandidates.stream()
                            .filter(item -> item.name() != null && item.name().matches(".*(?:X线|摄影|DR|CR|透视|放射).*"))
                            .toList();
                    if (!filtered.isEmpty()) return filtered;
                }
                if (intentName.matches(".*(?:CT|计算机断层).*")) {
                    var filtered = siteCandidates.stream()
                            .filter(item -> item.name() != null && item.name().toUpperCase().contains("CT"))
                            .toList();
                    if (!filtered.isEmpty()) return filtered;
                }
                if (intentName.matches(".*(?:MRI|磁共振).*")) {
                    var filtered = siteCandidates.stream()
                            .filter(item -> item.name() != null && (item.name().toUpperCase().contains("MRI") || item.name().contains("磁共振")))
                            .toList();
                    if (!filtered.isEmpty()) return filtered;
                }
                if (intentName.matches(".*(?:超声|B超|彩超).*")) {
                    var filtered = siteCandidates.stream()
                            .filter(item -> item.name() != null && (item.name().contains("超声") || item.name().contains("彩超")))
                            .toList();
                    if (!filtered.isEmpty()) return filtered;
                }
                return siteCandidates;
            }
        }
        return List.of();
    }

    private boolean matchesExactOrAssay(String name, String catalogName) {
        if (catalogName == null) return false;
        if (name.equalsIgnoreCase(catalogName)) return true;
        if ((name + "测定").equalsIgnoreCase(catalogName)) return true;
        if (name.endsWith("测定") && name.substring(0, name.length() - 2).equalsIgnoreCase(catalogName)) return true;
        return false;
    }
}
