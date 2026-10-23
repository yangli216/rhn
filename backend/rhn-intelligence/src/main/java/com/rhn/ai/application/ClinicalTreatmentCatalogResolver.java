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
    private final TreatmentUsageMapper usageMapper;
    private final Map<String, Alias> aliases = new LinkedHashMap<>();

    public record Alias(String type, String name, List<String> aliases, List<String> queries, boolean broad,
                        List<String> reviewNames) {}

    /** Without a usage mapper, model usage drafts are simply ignored. */
    public ClinicalTreatmentCatalogResolver(OutpatientPrescriptionInventoryDirectory inventory,
            ServiceCatalogDirectory services, MedicationKnowledgeDirectory medications,
            ExecutionContextProvider contexts, JsonCodec jsonCodec) {
        this(inventory, services, medications, contexts, jsonCodec, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public ClinicalTreatmentCatalogResolver(OutpatientPrescriptionInventoryDirectory inventory,
            ServiceCatalogDirectory services, MedicationKnowledgeDirectory medications,
            ExecutionContextProvider contexts, JsonCodec jsonCodec, TreatmentUsageMapper usageMapper) {
        this.inventory = inventory; this.services = services; this.medications = medications; this.contexts = contexts;
        this.usageMapper = usageMapper;
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
            List<String> split = intent.catalogItemId() == null ? splitServiceName(intent.name()) : List.of(text(intent.name()));
            boolean knownServices = split.size() > 1 && split.stream().allMatch(name -> aliases.containsKey(normalize(name)));
            List<String> names = Set.of("LABORATORY", "EXAMINATION").contains(rawType) || knownServices
                    ? split : List.of(text(intent.name()));
            for (String name : names) {
                if (result.size() >= 24) throw com.rhn.shared.api.BusinessErrors.badRequest("AI_CATALOG_TOO_MANY_ITEMS", "组合项目拆分后超过24项，请分批核对");
                var source = new TreatmentRecommendation(intent.type(), intent.catalogItemId(), intent.medicationId(), intent.code(), name.trim(),
                        intent.specification(), intent.rationale(), intent.usageSuggestion(), intent.purpose());
                String key = rawType + ":" + normalize(name) + ":" + text(intent.specification())
                        + (intent.catalogItemId() == null ? "" : ":ID:" + intent.catalogItemId());
                if (!result.containsKey(key)) result.put(key, resolveOne(key, source, context, date));
            }
        }
        return List.copyOf(result.values());
    }

    /**
     * Resolves a laboratory or examination name only when it has a curated alias entry. Names without one are left to
     * the caller, so this never widens matching to free-text search; ambiguous results stay {@code AMBIGUOUS}.
     */
    public Optional<TreatmentMatch> resolveCuratedAlias(String type, String name, LocalDate date) {
        String rawType = text(type).toUpperCase(Locale.ROOT);
        Alias alias = aliases.get(normalize(name));
        if (alias == null || !alias.type().equals(rawType)) return Optional.empty();
        var intent = new TreatmentRecommendation(rawType, null, null, null, text(name), null, null);
        return Optional.of(resolveOne(rawType + ":" + normalize(name), intent, contexts.requireCurrent(), date));
    }

    private TreatmentMatch resolveOne(String key, TreatmentRecommendation source, ExecutionContext context, LocalDate date) {
        long started = System.nanoTime();
        // A model usage draft (unresolved wording) is consumed here and never echoed back inside the intent.
        final TreatmentRecommendation intent = source.usageSuggestion() == null ? source : new TreatmentRecommendation(
                source.type(), source.catalogItemId(), source.medicationId(), source.code(), source.name(),
                source.specification(), source.rationale(), null, source.purpose());
        var counts = new Counts();
        String type = text(intent.type()).toUpperCase(Locale.ROOT);
        Alias alias = intent.catalogItemId() == null ? aliases.get(normalize(intent.name())) : null;
        if (alias != null && Set.of("MEDICATION", "LABORATORY", "EXAMINATION").contains(type)) type = alias.type();
        String query = alias == null ? text(intent.name()) : alias.name();
        TreatmentMatch result;
        try {
            if (!Set.of("MEDICATION", "LABORATORY", "EXAMINATION").contains(type) || query.isBlank() || query.length() > 100) {
                result = new TreatmentMatch(key, intent, "INVALID_INTENT", "项目名称或类型不完整，请重新检索确认。", List.of());
            } else if (intent.catalogItemId() != null && !"MEDICATION".equals(type)) {
                var selected = services.findOrderableServicesByIds(List.of(intent.catalogItemId()), context.organizationId(), date)
                        .stream().filter(item -> intent.catalogItemId().equals(item.id()) && typeMatches(intent.type(), item.sdServiceType()))
                        .map(item -> new TreatmentRecommendation(item.sdServiceType(), item.id(), null, item.code(), item.name(),
                                item.specimenType() == null ? item.examinationType() : item.specimenType(), intent.rationale(),
                                null, intent.purpose())).toList();
                result = selected.size() == 1 ? new TreatmentMatch(key, intent, "MATCHED", "已核对所选院内项目", selected)
                        : new TreatmentMatch(key, intent, "NO_ORDERABLE_SERVICE", "所选项目在本次机构不可开立，请重新选择。", List.of());
            } else if ("MEDICATION".equals(type)) {
                result = resolveMedication(key, intent, query, context, counts,
                        usageMapper == null || source.usageSuggestion() == null ? null
                                : new Usage(usageMapper.session(context, date), source.usageSuggestion()));
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

    private static final List<String> ANATOMICAL_SITES = List.of(
            "胸部", "腹部", "头颅", "颅脑", "盆腔", "颈部", "腰椎", "胸椎", "颈椎", "脊柱",
            "骨盆", "双肺", "肺部", "膝关节", "肩关节", "肘关节", "腕关节", "髋关节", "踝关节",
            "四肢", "心脏", "乳腺", "甲状腺", "前列腺", "子宫", "附件", "眼眶", "鼻窦"
    );

    private List<String> deriveQueries(String name, String type) {
        var derived = new LinkedHashSet<String>();
        String raw = text(name);
        if (raw.isBlank()) return List.of();
        derived.add(raw);
        String withoutParen = raw.replaceAll("(?i)[\\(（\\[【][^\\)）\\]】]*[\\)）\\]】]", "").trim();
        if (!withoutParen.isEmpty()) derived.add(withoutParen);

        if ("EXAMINATION".equals(type)) {
            String strippedPosition = withoutParen.replaceAll("(?:正位|反位|侧位|正侧位|立位|卧位|斜位|后前位|前后位|轴位|水平位|切线位|双向|双侧|左侧|右侧|单侧)$", "").trim();
            if (!strippedPosition.isEmpty()) derived.add(strippedPosition);
            for (String base : List.of(withoutParen, strippedPosition)) {
                if (base.isEmpty()) continue;
                if (base.contains("摄片")) derived.add(base.replace("摄片", "摄影"));
                if (base.contains("X光")) derived.add(base.replace("X光", "X线"));
                if (base.contains("平片")) derived.add(base.replace("平片", "摄影"));
                if (base.contains("拍片")) derived.add(base.replace("拍片", "摄影"));
            }
        } else if ("LABORATORY".equals(type)) {
            String base = withoutParen.replaceFirst("^血清", "血")
                    .replaceFirst("(?:检查|检测|检验|测定|项目)$", "").trim();
            if (!base.isEmpty()) {
                derived.add(base);
                derived.add(base + "测定");
            }
        }
        return List.copyOf(derived);
    }

    private List<com.rhn.platform.masterdata.api.MasterDataViews.ServiceView> expandExaminationCandidates(
            String intentName, Long organizationId, LocalDate date) {
        if (intentName == null || intentName.isBlank()) return List.of();
        for (String site : ANATOMICAL_SITES) {
            if (intentName.contains(site)) {
                var siteCandidates = services.searchOrderableServices(site, "EXAMINATION", organizationId, date);
                if (siteCandidates.isEmpty()) continue;
                if (intentName.matches("(?i).*(?:X线|X光|摄片|摄影|DR|CR|透视|平片|拍片|胸片).*")) {
                    var filtered = siteCandidates.stream()
                            .filter(item -> item.name() != null && item.name().matches(".*(?:X线|摄影|DR|CR|透视|放射).*"))
                            .toList();
                    if (!filtered.isEmpty()) return filtered;
                }
                if (intentName.matches("(?i).*(?:CT|计算机断层).*")) {
                    var filtered = siteCandidates.stream()
                            .filter(item -> item.name() != null && item.name().toUpperCase(Locale.ROOT).contains("CT"))
                            .toList();
                    if (!filtered.isEmpty()) return filtered;
                }
                if (intentName.matches("(?i).*(?:MRI|磁共振).*")) {
                    var filtered = siteCandidates.stream()
                            .filter(item -> item.name() != null && (item.name().toUpperCase(Locale.ROOT).contains("MRI")
                                    || item.name().contains("磁共振")))
                            .toList();
                    if (!filtered.isEmpty()) return filtered;
                }
                if (intentName.matches(".*(?:超声|B超|彩超).*")) {
                    var filtered = siteCandidates.stream()
                            .filter(item -> item.name() != null && (item.name().contains("超声") || item.name().contains("彩超")))
                            .toList();
                    if (!filtered.isEmpty()) return filtered;
                }
            }
        }
        return List.of();
    }

    private TreatmentMatch resolveService(String key, TreatmentRecommendation intent, String type, String query,
            Alias alias, ExecutionContext context, LocalDate date, Counts counts) {
        var queries = new LinkedHashSet<String>();
        queries.addAll(deriveQueries(intent.name(), type));
        if (!query.isBlank()) queries.addAll(deriveQueries(query, type));
        if (alias != null) queries.addAll(alias.queries());
        var candidates = new LinkedHashMap<String, TreatmentRecommendation>();
        var reviewIds = new HashSet<Long>();
        for (String search : queries) {
            for (var service : services.searchOrderableServices(search, type, context.organizationId(), date)) {
                counts.catalog++;
                // Review names retrieve related methods, never declare specimen/method equivalence.
                String localName = service.organizationAdoption() == null ? null : service.organizationAdoption().localName();
                boolean exactAlias = alias != null && (sameAlias(service.name(), alias) || sameAlias(localName, alias));
                boolean requiresReview = alias != null && !exactAlias
                        && (reviewName(service.name(), alias) || reviewName(localName, alias));
                if (alias != null && !alias.broad() && !exactAlias && !requiresReview) continue;
                if (requiresReview) reviewIds.add(service.id());
                var item = new TreatmentRecommendation(type, service.id(), null, service.code(), service.name(),
                        service.specimenType() == null ? service.examinationType() : service.specimenType(), intent.rationale(),
                        null, intent.purpose());
                candidates.putIfAbsent(type + ":" + service.id(), item);
            }
        }
        if (candidates.isEmpty() && alias == null && "EXAMINATION".equals(type)) {
            for (var service : expandExaminationCandidates(intent.name(), context.organizationId(), date)) {
                counts.catalog++;
                reviewIds.add(service.id());
                var item = new TreatmentRecommendation(type, service.id(), null, service.code(), service.name(),
                        service.specimenType() == null ? service.examinationType() : service.specimenType(), intent.rationale(),
                        null, intent.purpose());
                candidates.putIfAbsent(type + ":" + service.id(), item);
            }
        }
        var result = match(key, intent, List.copyOf(candidates.values()), "NO_ORDERABLE_SERVICE",
                "本院可开立目录未匹配，仅供医生评估医嘱方向；可调整名称重新检索。", query);
        if (!reviewIds.isEmpty() && (!"MATCHED".equals(result.status())
                || reviewIds.contains(result.candidates().getFirst().catalogItemId()))) {
            String reviewReason = "EXAMINATION".equals(type)
                    ? "已找到相关院内项目，请核对部位、检查方式及本次适用性后选择。"
                    : "已找到相关院内项目，请核对标本、检查方法及本次适用性后选择。";
            return new TreatmentMatch(key, intent, "AMBIGUOUS", reviewReason, List.copyOf(candidates.values()));
        }
        return result;
    }

    private boolean typeMatches(String requested, String actual) {
        return text(requested).equalsIgnoreCase(actual);
    }

    private boolean reviewName(String name, Alias alias) {
        return name != null && alias.reviewNames() != null
                && alias.reviewNames().stream().anyMatch(value -> normalize(value).equals(normalize(name)));
    }

    private boolean sameAlias(String name, Alias alias) { return name != null && alias.equals(aliases.get(normalize(name))); }

    private record Usage(TreatmentUsageMapper.Session session, com.rhn.ai.api.ClinicalAssistantContracts.TreatmentUsageSuggestion raw) {}

    private TreatmentMatch resolveMedication(String key, TreatmentRecommendation intent, String query,
            ExecutionContext context, Counts counts, Usage usage) {
        var available = new LinkedHashMap<Long, TreatmentRecommendation>();
        var specificationReview = new LinkedHashMap<Long, TreatmentRecommendation>();
        var definitions = inventory.findOrderableMedicationCandidates(context.tenantId(), context.organizationId(), context.departmentId(), query);
        counts.catalog = definitions.size();
        for (var medication : definitions) {
            if (intent.medicationId() != null && !intent.medicationId().equals(medication.id())) continue;
            if (!"ACTIVE".equals(medication.sdStatus()) || medication.availablePackageQuantity() == null
                    || medication.availablePackageQuantity().signum() <= 0) { counts.stock++; continue; }
            // Validated against this drug's own units and flags; all candidates share the same wording.
            var suggestion = usage == null ? null : usage.session().map(usage.raw(), medication);
            boolean mismatch = MedicationSpecificationEvidence.reviewExplicitSpecification(intent.specification(),
                    MedicationSpecificationEvidence.catalogSpecification(medication.preparationSpec(), medication.preparationUnit())) != null;
            for (var product : medication.products()) {
                if (intent.catalogItemId() != null && !intent.catalogItemId().equals(product.id())) continue;
                if (!product.orderable() || !"ACTIVE".equals(product.sdStatus()) || product.organizationAdoption() == null
                        || !product.organizationAdoption().orderable() || !product.organizationAdoption().dispensable()) { counts.product++; continue; }
                var stock = inventory.inspectMedicationAvailability(context.tenantId(), context.organizationId(), context.departmentId(), product.id(), null);
                if (stock == null || !stock.routeConfigured() || !stock.stockItemConfigured()
                        || stock.availablePackageQuantity() == null || stock.availablePackageQuantity().signum() <= 0) { counts.stock++; continue; }
                var item = new TreatmentRecommendation("MEDICATION", product.id(), medication.id(), medication.code(), medication.name(),
                        medication.preparationSpec(), intent.rationale(), suggestion);
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
        if (intent.catalogItemId() != null && available.size() == 1) return new TreatmentMatch(key, intent, "MATCHED",
                "已核对所选院内产品", List.copyOf(available.values()));
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
        // 药品意图只写通用名（缬沙坦），院内唯一可开立产品是“通用名+剂型”（缬沙坦片）：剂型后缀是同一品种的
        // 规范写法而不是另一种药，规格不一致早已在 resolveMedication 分流，这里可以确定性匹配，不必人工确认。
        if (candidates.size() == 1 && "MEDICATION".equals(candidates.getFirst().type())) {
            String intentName = normalize(query);
            String candidateName = normalize(candidates.getFirst().name());
            String candidateStem = DOSAGE_FORM_SUFFIX.matcher(candidateName).replaceFirst("");
            if (!intentName.isEmpty() && !candidateStem.equals(candidateName) && candidateStem.equals(intentName)
                    && !DOSAGE_FORM_SUFFIX.matcher(intentName).find())
                return new TreatmentMatch(key, intent, "MATCHED", "已匹配唯一可用药品（院内剂型：" + candidates.getFirst().name() + "）", candidates);
        }
        return new TreatmentMatch(key, intent, "AMBIGUOUS", candidates.size() == 1
                ? "名称未完全一致，请核对实际项目及规格。" : "存在多个可用项目，请选择本次需要的项目。", candidates);
    }

    private static final java.util.regex.Pattern DOSAGE_FORM_SUFFIX = java.util.regex.Pattern.compile(
            "(?:胶囊剂|胶囊|片剂|片|口服溶液|口服液|颗粒剂|颗粒|混悬滴剂|混悬液|糖浆剂|糖浆|滴剂|注射液|注射用冻干粉针|冻干粉针|注射剂"
                    + "|软膏剂|软膏|乳膏剂|乳膏|凝胶剂|凝胶|滴眼液|滴鼻液|喷雾剂|吸入气雾剂|气雾剂|栓剂|栓|贴膏剂|贴膏|贴剂|散剂|散|洗剂)$");
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
