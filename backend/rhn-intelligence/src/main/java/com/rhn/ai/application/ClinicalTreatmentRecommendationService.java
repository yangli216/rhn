package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentRecommendation;
import com.rhn.ai.api.ClinicalAssistantContracts.SafetyAlert;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;

/** Resolve clinical intent first, then let the model choose only from institution-backed candidates. */
@Service
public class ClinicalTreatmentRecommendationService {
    private final OutpatientPrescriptionInventoryDirectory inventory;
    private final ServiceCatalogDirectory services;
    private final ExecutionContextProvider contexts;
    private final ClinicalAiModelGateway gateway;

    public ClinicalTreatmentRecommendationService(OutpatientPrescriptionInventoryDirectory inventory,
            ServiceCatalogDirectory services, ExecutionContextProvider contexts, ClinicalAiModelGateway gateway) {
        this.inventory = inventory; this.services = services; this.contexts = contexts; this.gateway = gateway;
    }

    public record Result(List<TreatmentRecommendation> items, List<SafetyAlert> alerts) {}

    public Result recommend(List<TreatmentRecommendation> intents, ClinicalAiModelGateway.ModelRequest request,
                            ClinicalAssistantSettings runtime) {
        var context = contexts.requireCurrent();
        var available = new LinkedHashMap<String, TreatmentRecommendation>();
        var deterministic = new LinkedHashMap<String, TreatmentRecommendation>();
        var ambiguous = new LinkedHashMap<String, TreatmentRecommendation>();
        var alerts = new ArrayList<SafetyAlert>();
        var seen = new java.util.HashSet<String>();
        for (var intent : intents.stream().limit(12).toList()) {
            if (intent == null || intent.name() == null || intent.name().isBlank()
                    || intent.type() == null || !Set.of("MEDICATION", "LABORATORY", "EXAMINATION").contains(intent.type())) continue;
            String name = intent.name().trim();
            if (name.length() > 100 || !seen.add(intent.type() + "|" + name)) continue;
            var intentCandidates = new ArrayList<TreatmentRecommendation>();
            try {
                if ("MEDICATION".equals(intent.type())) {
                    for (var medication : inventory.findOrderableMedications(context.tenantId(), context.organizationId(),
                            context.departmentId(), name).stream().limit(8).toList()) {
                        if (!"ACTIVE".equals(medication.sdStatus()) || medication.availablePackageQuantity() == null
                                || medication.availablePackageQuantity().signum() <= 0) continue;
                        for (var product : medication.products()) {
                            if (!product.orderable() || !"ACTIVE".equals(product.sdStatus())
                                    || product.organizationAdoption() == null || !product.organizationAdoption().orderable()
                                    || !product.organizationAdoption().dispensable()) continue;
                            var stock = inventory.inspectMedicationAvailability(context.tenantId(), context.organizationId(),
                                    context.departmentId(), product.id(), null);
                            if (stock == null || !stock.routeConfigured() || !stock.stockItemConfigured()
                                    || stock.availablePackageQuantity() == null || stock.availablePackageQuantity().signum() <= 0) continue;
                            var item = new TreatmentRecommendation("MEDICATION", product.id(), medication.id(),
                                    medication.code(), medication.name(), medication.preparationSpec(), intent.rationale());
                            available.putIfAbsent(key(item), item);
                            intentCandidates.add(item);
                        }
                    }
                } else {
                    for (var service : services.searchOrderableServices(name, intent.type(), context.organizationId(), LocalDate.now())) {
                        var item = new TreatmentRecommendation(intent.type(), service.id(), null, service.code(),
                                service.name(), service.specimenType() == null ? service.examinationType() : service.specimenType(), intent.rationale());
                        available.putIfAbsent(key(item), item);
                        intentCandidates.add(item);
                    }
                }
                if (intentCandidates.isEmpty()) {
                    alerts.add(new SafetyAlert("INFO", "目录待匹配",
                            name + "未匹配到本次可用目录，未作为可开立项目推荐。"));
                } else {
                    var unique = intentCandidates.stream().collect(java.util.stream.Collectors.toMap(
                            ClinicalTreatmentRecommendationService::key, value -> value, (left, right) -> left,
                            LinkedHashMap::new)).values().stream().toList();
                    var exact = unique.stream().filter(candidate -> exactMatch(intent, candidate)).toList();
                    if (exact.size() == 1) {
                        deterministic.putIfAbsent(key(exact.getFirst()), exact.getFirst());
                    } else {
                        unique.forEach(candidate -> ambiguous.putIfAbsent(key(candidate), candidate));
                    }
                }
            } catch (RuntimeException exception) {
                alerts.add(new SafetyAlert("WARNING", "目录暂不可用", name + "的可用目录读取失败，请在医嘱区重新检索。"));
            }
        }
        if (available.isEmpty()) return new Result(List.of(), alerts);
        if (deterministic.size() >= 8 || ambiguous.isEmpty()) {
            return new Result(deterministic.values().stream().limit(8).toList(), alerts);
        }
        var candidates = ambiguous.values().stream().limit(64).toList();
        try {
            var selection = gateway.analyze(new ClinicalAiModelGateway.ModelRequest(request.promptVersion(), request.question(),
                    request.voiceTranscript(), request.draft(), request.resident(), request.allergies(), request.availablePlans(),
                    request.diagnosticReports(), request.clinicalHistory(), request.priorSuggestion(), request.receptionScene(),
                    request.receptionSceneContext(), "CATALOG_TREATMENT", candidates), runtime);
            var result = new LinkedHashMap<String, TreatmentRecommendation>(deterministic);
            for (var item : selection.treatmentRecommendations()) {
                if (item == null || item.catalogItemId() == null) continue;
                var mapped = candidates.stream().filter(candidate -> key(candidate).equals(key(item))).findFirst().orElse(null);
                if (mapped == null) continue;
                String rationale = item.rationale() == null ? "请结合当前病情核对适应证。" : item.rationale().substring(0, Math.min(500, item.rationale().length()));
                result.putIfAbsent(key(mapped), new TreatmentRecommendation(mapped.type(), mapped.catalogItemId(),
                        mapped.medicationId(), mapped.code(), mapped.name(), mapped.specification(), rationale));
                if (result.size() >= 8) break;
            }
            return new Result(result.values().stream().limit(8).toList(), alerts);
        } catch (RuntimeException exception) {
            alerts.add(new SafetyAlert("WARNING", "治疗推荐未完成", "病历及诊断已整理，目录治疗推荐暂未完成，请在医嘱区检索核对。"));
            return new Result(List.of(), alerts);
        }
    }

    private static boolean exactMatch(TreatmentRecommendation intent, TreatmentRecommendation candidate) {
        if (intent.code() != null && candidate.code() != null
                && intent.code().trim().equalsIgnoreCase(candidate.code().trim())) return true;
        return normalize(intent.name()).equals(normalize(candidate.name()));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("[\\s()（）\\[\\]【】]", "").toLowerCase(java.util.Locale.ROOT);
    }

    private static String key(TreatmentRecommendation item) { return item.type() + "|" + item.catalogItemId(); }
}
