package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentMatch;
import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentRecommendation;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.*;

/** Shared, read-only discovery for AI generation and evidence imports. Never chooses an ambiguous item. */
@Service
public class ClinicalTreatmentCatalogResolver {
    private static final Logger log = LoggerFactory.getLogger(ClinicalTreatmentCatalogResolver.class);
    private final OutpatientPrescriptionInventoryDirectory inventory;
    private final ServiceCatalogDirectory services;
    private final MedicationKnowledgeDirectory medications;
    private final ExecutionContextProvider contexts;
    private final Map<String, Alias> aliases = new LinkedHashMap<>();

    public record Alias(String type, String name, List<String> aliases, List<String> queries, boolean broad) {}

    public ClinicalTreatmentCatalogResolver(OutpatientPrescriptionInventoryDirectory inventory,
            ServiceCatalogDirectory services, MedicationKnowledgeDirectory medications,
            ExecutionContextProvider contexts, JsonCodec jsonCodec) {
        this.inventory = inventory; this.services = services; this.medications = medications; this.contexts = contexts;
        try (var input = getClass().getResourceAsStream("/clinical-catalog-aliases.json")) {
            if (input == null) throw new IllegalStateException("缺少临床目录别名配置");
            for (var alias : jsonCodec.read(new String(input.readAllBytes(), StandardCharsets.UTF_8), Alias[].class)) {
                if (!Set.of("LABORATORY", "EXAMINATION").contains(alias.type())) throw new IllegalStateException("无效目录别名类型");
                var names = new ArrayList<>(alias.aliases()); names.add(alias.name());
                for (String name : names) {
                    Alias previous = aliases.putIfAbsent(normalize(name), alias);
                    if (previous != null && !previous.equals(alias)) throw new IllegalStateException("临床目录别名冲突");
                }
            }
        } catch (java.io.IOException exception) { throw new IllegalStateException("目录别名加载失败", exception); }
    }

    public List<TreatmentMatch> resolve(List<TreatmentRecommendation> intents, LocalDate date) {
        ExecutionContext context = contexts.requireCurrent();
        var result = new LinkedHashMap<String, TreatmentMatch>();
        // Split only explicit additive test separators; never split medication names, ratios or alternatives.
        for (var intent : intents.stream().limit(12).toList()) {
            if (intent == null) continue;
            String rawType = text(intent.type()).toUpperCase(Locale.ROOT);
            List<String> split = splitServiceName(intent.name());
            boolean knownServices = split.size() > 1 && split.stream().allMatch(name -> aliases.containsKey(normalize(name)));
            List<String> names = Set.of("LABORATORY", "EXAMINATION").contains(rawType) || knownServices
                    ? split : List.of(text(intent.name()));
            for (String name : names) {
                if (result.size() >= 24) throw com.rhn.shared.api.BusinessErrors.badRequest("AI_CATALOG_TOO_MANY_ITEMS", "组合项目拆分后超过24项，请分批核对");
                var source = new TreatmentRecommendation(intent.type(), null, null, null, name.trim(),
                        intent.specification(), intent.rationale());
                String key = rawType + ":" + normalize(name) + ":" + text(intent.specification());
                if (!result.containsKey(key)) result.put(key, resolveOne(key, source, context, date));
            }
        }
        return List.copyOf(result.values());
    }

    private TreatmentMatch resolveOne(String key, TreatmentRecommendation intent, ExecutionContext context, LocalDate date) {
        long started = System.nanoTime();
        var counts = new Counts();
        String type = text(intent.type()).toUpperCase(Locale.ROOT);
        Alias alias = aliases.get(normalize(intent.name()));
        if (alias != null && Set.of("MEDICATION", "LABORATORY", "EXAMINATION").contains(type)) type = alias.type();
        String query = alias == null ? text(intent.name()) : alias.name();
        TreatmentMatch result;
        try {
            if (!Set.of("MEDICATION", "LABORATORY", "EXAMINATION").contains(type) || query.isBlank() || query.length() > 100) {
                result = new TreatmentMatch(key, intent, "INVALID_INTENT", "项目名称或类型不完整，请重新检索确认。", List.of());
            } else if ("MEDICATION".equals(type)) {
                result = resolveMedication(key, intent, query, context, counts);
            } else {
                result = resolveService(key, intent, type, query, alias, context, date, counts);
            }
        } catch (RuntimeException exception) {
            result = new TreatmentMatch(key, intent, "CATALOG_ERROR", "目录读取失败，请重试。", List.of());
            log.warn("clinical_ai_catalog_error correlationId={} errorType={}", context.correlationId(), exception.getClass().getSimpleName());
        }
        // Only bounded intent fields, never prompts, records, patient identity or exception messages.
        log.info("clinical_ai_catalog_match correlationId={} organizationId={} departmentId={} businessDate={} "
                        + "rawType={} effectiveType={} name={} specification={} query={} outcome={} catalogCount={} "
                        + "candidateCount={} candidateIds={} candidateSpecifications={} specificationRejects={} productRejects={} stockRejects={} totalMs={}",
                context.correlationId(), context.organizationId(), context.departmentId(), date,
                logText(intent.type()), type, logText(intent.name()), logText(intent.specification()), logText(query),
                result.status(), counts.catalog, result.candidates().size(),
                result.candidates().stream().limit(20).map(TreatmentRecommendation::catalogItemId).toList(),
                result.candidates().stream().limit(20).map(item -> logText(item.specification())).toList(), counts.specification,
                counts.product, counts.stock, (System.nanoTime() - started) / 1_000_000);
        return result;
    }

    private TreatmentMatch resolveService(String key, TreatmentRecommendation intent, String type, String query,
            Alias alias, ExecutionContext context, LocalDate date, Counts counts) {
        var queries = new LinkedHashSet<String>(); queries.add(text(intent.name())); queries.add(query);
        if (alias != null) queries.addAll(alias.queries());
        var candidates = new LinkedHashMap<String, TreatmentRecommendation>();
        for (String search : queries) {
            for (var service : services.searchOrderableServices(search, type, context.organizationId(), date)) {
                counts.catalog++;
                // An alias is an exact semantic mapping. Broad retrieval cannot turn ordinary CRP into hs-CRP.
                if (alias != null && !alias.broad() && !normalize(service.name()).equals(normalize(query))
                        && !sameAlias(service.name(), alias)
                        && !(service.organizationAdoption() != null && sameAlias(service.organizationAdoption().localName(), alias))) continue;
                var item = new TreatmentRecommendation(type, service.id(), null, service.code(), service.name(),
                        service.specimenType() == null ? service.examinationType() : service.specimenType(), intent.rationale());
                candidates.putIfAbsent(type + ":" + service.id(), item);
            }
        }
        return match(key, intent, List.copyOf(candidates.values()), "NO_ORDERABLE_SERVICE",
                "未找到当前机构可开立的项目，请核对目录名称、类型及机构采用配置。", query);
    }

    private boolean sameAlias(String name, Alias alias) { return name != null && alias.equals(aliases.get(normalize(name))); }

    private TreatmentMatch resolveMedication(String key, TreatmentRecommendation intent, String query,
            ExecutionContext context, Counts counts) {
        var available = new LinkedHashMap<Long, TreatmentRecommendation>();
        var specificationReview = new LinkedHashMap<Long, TreatmentRecommendation>();
        var definitions = inventory.findOrderableMedicationCandidates(context.tenantId(), context.organizationId(), context.departmentId(), query);
        counts.catalog = definitions.size();
        for (var medication : definitions) {
            if (!"ACTIVE".equals(medication.sdStatus()) || medication.availablePackageQuantity() == null
                    || medication.availablePackageQuantity().signum() <= 0) { counts.stock++; continue; }
            boolean mismatch = MedicationSpecificationEvidence.reviewExplicitSpecification(intent.specification(),
                    MedicationSpecificationEvidence.catalogSpecification(medication.preparationSpec(), medication.preparationUnit())) != null;
            for (var product : medication.products()) {
                if (!product.orderable() || !"ACTIVE".equals(product.sdStatus()) || product.organizationAdoption() == null
                        || !product.organizationAdoption().orderable() || !product.organizationAdoption().dispensable()) { counts.product++; continue; }
                var stock = inventory.inspectMedicationAvailability(context.tenantId(), context.organizationId(), context.departmentId(), product.id(), null);
                if (stock == null || !stock.routeConfigured() || !stock.stockItemConfigured()
                        || stock.availablePackageQuantity() == null || stock.availablePackageQuantity().signum() <= 0) { counts.stock++; continue; }
                var item = new TreatmentRecommendation("MEDICATION", product.id(), medication.id(), medication.code(), medication.name(),
                        medication.preparationSpec(), intent.rationale());
                if (mismatch) { counts.specification++; specificationReview.putIfAbsent(product.id(), item); }
                else available.putIfAbsent(product.id(), item);
            }
        }
        if (available.isEmpty() && !specificationReview.isEmpty()) return new TreatmentMatch(key, intent, "SPECIFICATION_REVIEW",
                "建议规格与院内规格不一致，请明确选择实际产品及规格后核对用法。", List.copyOf(specificationReview.values()));
        if (available.isEmpty() && definitions.isEmpty()) {
            boolean exists = !medications.search(query).isEmpty();
            return new TreatmentMatch(key, intent, exists ? "MEDICATION_UNAVAILABLE" : "MEDICATION_NOT_FOUND",
                    exists ? "药品目录存在，但本次没有可开立产品，请核对机构采用、产品包装、药房路由及库存。"
                            : "未检索到药品目录，请调整名称或维护院内药品。", List.of());
        }
        return match(key, intent, List.copyOf(available.values()), "MEDICATION_UNAVAILABLE",
                "当前没有可开立产品，请核对产品配置、药房路由及库存。", query);
    }

    private TreatmentMatch match(String key, TreatmentRecommendation intent, List<TreatmentRecommendation> candidates,
            String emptyStatus, String emptyReason, String query) {
        if (candidates.isEmpty()) return new TreatmentMatch(key, intent, emptyStatus, emptyReason, candidates);
        var exact = candidates.stream().filter(item -> normalize(item.name()).equals(normalize(query))).toList();
        if (exact.size() == 1) return new TreatmentMatch(key, intent, "MATCHED", "已匹配院内目录", exact);
        if (candidates.size() == 1 && ((!"MEDICATION".equals(candidates.getFirst().type())
                && normalize(candidates.getFirst().name()).contains(normalize(query)))
                || normalize(candidates.getFirst().code()).equals(normalize(query))))
            return new TreatmentMatch(key, intent, "MATCHED", "已匹配唯一可用目录", candidates);
        return new TreatmentMatch(key, intent, "AMBIGUOUS", candidates.size() == 1
                ? "名称未完全一致，请核对实际项目及规格。" : "存在多个可用项目，请选择本次需要的项目。", candidates);
    }

    private static String text(String value) { return value == null ? "" : value.trim(); }
    static List<String> splitServiceName(String value) {
        String name = Normalizer.normalize(text(value), Normalizer.Form.NFKC);
        var names = new ArrayList<String>();
        int depth = 0, start = 0;
        for (int index = 0; index < name.length(); index++) {
            char ch = name.charAt(index);
            if (ch == '(' || ch == '[' || ch == '【') depth++;
            if (ch == ')' || ch == ']' || ch == '】') depth = Math.max(0, depth - 1);
            String before = name.substring(start, index).trim();
            boolean additive = ch == '+' && index + 1 < name.length()
                    && Character.isLetter(name.substring(index + 1).stripLeading().isEmpty() ? ' ' : name.substring(index + 1).stripLeading().charAt(0))
                    && !before.matches("(?i)[a-z]{1,2}[0-9]*");
            if (depth == 0 && (ch == '、' || additive) && !before.isEmpty()) {
                names.add(before); start = index + 1;
            }
        }
        names.add(name.substring(start).trim());
        return List.copyOf(names);
    }
    private static String logText(String value) { String v = text(value).replaceAll("[\\p{Cntrl}]", " "); return v.substring(0, Math.min(100, v.length())); }
    static String normalize(String value) { return Normalizer.normalize(text(value), Normalizer.Form.NFKC)
            .replaceAll("[\\s()\\[\\]【】\\-]", "").toLowerCase(Locale.ROOT); }
    private static class Counts { int catalog, specification, product, stock; }
}
