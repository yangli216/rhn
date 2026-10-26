package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.ExaminationChargePreview;
import com.rhn.ai.api.ClinicalAssistantContracts.ExaminationChargePreviewLine;
import com.rhn.ai.api.ClinicalAssistantContracts.ExaminationIntent;
import com.rhn.ai.api.ClinicalAssistantContracts.ExaminationSitePrefill;
import com.rhn.ai.api.ClinicalAssistantContracts.ExaminationSitePlan;
import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentMatch;
import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentRecommendation;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.ExaminationSiteDirectory;
import com.rhn.platform.masterdata.api.ExaminationSiteDirectory.ExaminationSiteOption;
import com.rhn.platform.masterdata.api.ExaminationSiteDirectory.ExaminationSiteRule;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.platform.terminology.api.BodySiteDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * 检查意图两步匹配：先按检查方式、超声方式与增强方式定位唯一可开立项目，再把临床部位经部位词典对应到该项目的部位方式。
 * 部位只在本项目的部位方式中解析；上下级部位只作为待核对候选，不认定等价。收费预览来自收费方案与院内价格，从不取自模型。
 */
@Service
public class ExaminationIntentMatcher {
    private static final Logger log = LoggerFactory.getLogger(ExaminationIntentMatcher.class);
    /** 模型检查方式 → 检查配置的检查类型字典值；其余方式没有检查配置，回退名称检索。 */
    private static final Map<String, String> EXAM_TYPES = Map.of("US", "ULTRASOUND", "CT", "CT", "MR", "MRI", "DR", "RADIOGRAPHY");
    private static final int MAX_CANDIDATES = 8;

    private final ExaminationSiteDirectory examinations;
    private final BodySiteDirectory bodySites;
    private final ServiceCatalogDirectory services;
    private final CatalogLifecycleDirectory catalog;

    public ExaminationIntentMatcher(ExaminationSiteDirectory examinations, BodySiteDirectory bodySites,
                                    ServiceCatalogDirectory services, CatalogLifecycleDirectory catalog) {
        this.examinations = examinations; this.bodySites = bodySites; this.services = services; this.catalog = catalog;
    }

    /** 一次推荐内共用的部位词典快照。 */
    public Session session(ExecutionContext context, LocalDate date) {
        return new Session(context, date, bodySites.listBodySites(context.tenantId(), date));
    }

    public final class Session {
        private final ExecutionContext context;
        private final LocalDate date;
        private final Map<String, Long> conceptByTerm = new HashMap<>();
        private final Map<Long, BodySiteDirectory.BodySite> sites = new HashMap<>();
        private final Map<Long, Set<Long>> children = new HashMap<>();
        /** 解析名称用的部位词条，长词优先。 */
        private final List<String> terms;

        private Session(ExecutionContext context, LocalDate date, List<BodySiteDirectory.BodySite> dictionary) {
            this.context = context; this.date = date;
            Set<String> ambiguous = new HashSet<>();
            for (var site : dictionary) {
                sites.put(site.conceptId(), site);
                List<String> names = new ArrayList<>(site.aliases()); names.add(site.name());
                for (String name : names) {
                    Long previous = conceptByTerm.putIfAbsent(ClinicalTreatmentCatalogResolver.normalize(name), site.conceptId());
                    if (previous != null && !previous.equals(site.conceptId())) ambiguous.add(ClinicalTreatmentCatalogResolver.normalize(name));
                }
                for (Long parent : site.parentConceptIds()) children.computeIfAbsent(parent, key -> new HashSet<>()).add(site.conceptId());
            }
            ambiguous.forEach(conceptByTerm::remove);
            terms = dictionary.stream().flatMap(site -> java.util.stream.Stream.concat(site.aliases().stream(), java.util.stream.Stream.of(site.name())))
                    .filter(term -> conceptByTerm.containsKey(ClinicalTreatmentCatalogResolver.normalize(term)))
                    .distinct().sorted(Comparator.comparingInt(String::length).reversed()).toList();
        }

        /** 词典部位名称与别名，长词优先；替代原先写死的解剖部位清单。 */
        public List<String> siteTerms() { return terms; }

        /**
         * 从检查名称推导意图：检查方式、超声方式、增强方式关键词，加上部位词典的最长匹配。没有可识别的检查方式时为空，
         * 调用方保留原有名称检索。
         */
        public ExaminationIntent parse(String name) {
            String text = Objects.toString(name, "").trim();
            if (text.isEmpty()) return null;
            String upper = text.toUpperCase(Locale.ROOT);
            String modality = null, technique = null, contrast = null;
            String rest = text;
            if (text.contains("彩超") || text.contains("彩色多普勒")) { modality = "US"; technique = "COLOR_DOPPLER"; }
            else if (upper.contains("B超")) { modality = "US"; technique = "B_MODE"; }
            else if (text.contains("超声")) modality = "US";
            else if (upper.matches(".*(?:MRI|MR(?![A-Z])).*") || text.contains("磁共振")) modality = "MR";
            else if (upper.contains("CT") && !upper.contains("PET")) modality = "CT";
            else if (upper.matches(".*(?:DR|CR|X线|X光).*") || text.matches(".*(?:摄片|平片|拍片|胸片|摄影|透视).*")) modality = "DR";
            else if (text.contains("钼靶")) modality = "MG";
            else if (text.contains("心电图")) modality = "ECG";
            else if (text.matches(".*(?:胃镜|肠镜|内镜|内窥镜).*")) modality = "ENDOSCOPY";
            if (modality == null) return null;
            if ("CT".equals(modality) || "MR".equals(modality)) {
                if (text.matches(".*平扫\\s*(?:\\+|＋|加|及|和)\\s*增强.*")) contrast = "PLAIN_ENHANCED";
                else if (text.contains("增强")) contrast = "ENHANCED";
                else if (text.contains("平扫")) contrast = "PLAIN";
            }
            List<String> found = new ArrayList<>();
            if (!"ECG".equals(modality)) {
                rest = rest.replaceAll("(?i)彩色多普勒|彩超|B超|超声|MRI|磁共振|PET|CT|DR|CR|X线|X光|钼靶|平扫|增强|检查|摄片|平片|拍片|摄影|透视", " ");
                if (text.contains("胸片")) found.add("胸部");
                for (String term : terms) {
                    if (term.length() < 2) continue;
                    int index = rest.indexOf(term);
                    if (index < 0) continue;
                    found.add(term);
                    rest = rest.substring(0, index) + " " + rest.substring(index + term.length());
                    if (found.size() >= 6) break;
                }
                String compact = rest.replaceAll("[\\s+＋、,，及和]", "");
                if (found.isEmpty() && compact.length() == 1 && conceptByTerm.containsKey(compact)) found.add(compact);
            }
            String laterality = rest.contains("双侧") ? "BILATERAL" : rest.contains("左") && !rest.contains("右") ? "LEFT"
                    : rest.contains("右") && !rest.contains("左") ? "RIGHT" : null;
            return new ExaminationIntent(modality, technique, contrast, List.copyOf(new LinkedHashSet<>(found)), laterality);
        }

        /**
         * 第 2 步：按检查方式等属性定位可开立项目。没有对应检查配置时为空，调用方回退名称检索。
         * 唯一候选进入部位解析；多个候选交医生选择，每个候选都带部位解析结果。
         */
        public Optional<TreatmentMatch> resolve(String key, TreatmentRecommendation intent, ExaminationIntent exam) {
            String examType = exam == null || exam.modality() == null ? null : EXAM_TYPES.get(exam.modality());
            if (examType == null) return Optional.empty();
            var profiles = examinations.orderingProfiles(examType);
            if (profiles.isEmpty()) return Optional.empty();
            var attributes = new HashMap<Long, ExaminationSiteDirectory.ExaminationOrderingProfile>();
            profiles.forEach(profile -> attributes.put(profile.serviceId(), profile));
            var orderable = services.findOrderableServicesByIds(attributes.keySet(), context.organizationId(), date).stream()
                    .filter(item -> "EXAMINATION".equals(item.sdServiceType())).toList();
            orderable = prefer(orderable, item -> attributes.get(item.id()).examinationTechnique(), exam.technique());
            orderable = prefer(orderable, item -> attributes.get(item.id()).contrastPhase(), exam.contrastPhase());
            if (orderable.isEmpty()) return Optional.empty();
            var candidates = orderable.stream().map(item -> new TreatmentRecommendation("EXAMINATION", item.id(), null,
                    item.code(), item.name(), item.examinationType(), intent.rationale(), null, intent.purpose(), null,
                    sitePlan(item.id(), exam))).toList();
            if (candidates.size() > 1 && !requested(exam).isEmpty()) {
                var withSites = candidates.stream().filter(item -> !item.examinationSites().bodySites().isEmpty()).toList();
                if (!withSites.isEmpty()) candidates = withSites;
            }
            var echoed = withExamination(intent, exam);
            if (candidates.size() == 1) return Optional.of(siteChecked(key, echoed, candidates.getFirst(), "已按检查方式匹配院内开立项目"));
            return Optional.of(new TreatmentMatch(key, echoed, "AMBIGUOUS", "存在多个可开立检查项目，请按检查方式与部位选择。",
                    candidates.stream().limit(MAX_CANDIDATES).toList()));
        }

        /** 唯一候选的部位未全部确定时转为待核对，原因写明需要核对的部位。 */
        public TreatmentMatch siteChecked(String key, TreatmentRecommendation intent, TreatmentRecommendation candidate, String reason) {
            var plan = candidate.examinationSites();
            if (plan == null || "MATCHED".equals(plan.resolution()) || "NOT_REQUIRED".equals(plan.resolution())) {
                return new TreatmentMatch(key, intent, "MATCHED", reason, List.of(candidate));
            }
            return new TreatmentMatch(key, intent, "AMBIGUOUS", "请核对检查部位" + (plan.note() == null ? "。" : "：" + plan.note()),
                    List.of(candidate));
        }

        /** 为院内检查候选补充部位解析；已有结果的保留。 */
        public TreatmentRecommendation withSites(TreatmentRecommendation candidate, ExaminationIntent exam) {
            if (candidate.catalogItemId() == null || candidate.examinationSites() != null) return candidate;
            return new TreatmentRecommendation(candidate.type(), candidate.catalogItemId(), candidate.medicationId(),
                    candidate.code(), candidate.name(), candidate.specification(), candidate.rationale(),
                    candidate.usageSuggestion(), candidate.purpose(), null, sitePlan(candidate.catalogItemId(), exam));
        }

        /** 第 3、4 步：在开立项目的部位方式中解析部位，部位全部确定时预览收费。 */
        public ExaminationSitePlan sitePlan(Long serviceId, ExaminationIntent exam) {
            List<String> requested = requested(exam);
            ExaminationSiteRule rule = examinations.siteRule(serviceId).orElse(null);
            if (rule == null) return new ExaminationSitePlan("NOT_REQUIRED", List.of(), requested,
                    requested.isEmpty() ? null : "该项目未配置检查部位", null);
            List<ExaminationSitePrefill> chosen = new ArrayList<>();
            List<String> unresolved = new ArrayList<>();
            for (String name : requested) {
                ExaminationSitePrefill choice = choose(rule, name, exam.laterality());
                if (choice == null) unresolved.add(name);
                else if (chosen.stream().noneMatch(existing -> existing.code().equals(choice.code()))) chosen.add(choice);
            }
            List<String> notes = new ArrayList<>();
            int limit = rule.maxBodySiteCount() == null ? (rule.multiBodySite() ? Integer.MAX_VALUE : 1) : rule.maxBodySiteCount();
            if (chosen.size() > limit) {
                chosen = new ArrayList<>(chosen.subList(0, limit));
                notes.add("超过项目部位上限，仅预填前 " + limit + " 个");
            }
            if (!unresolved.isEmpty()) notes.add(String.join("、", unresolved) + "未对应到本项目部位");
            if (chosen.stream().anyMatch(ExaminationSitePrefill::requiresReview)) notes.add("部分部位按上下级部位推断");
            String resolution;
            if (requested.isEmpty()) {
                resolution = rule.bodySiteRequired() ? "UNRESOLVED" : "NOT_REQUIRED";
                if (rule.bodySiteRequired()) notes.add("该项目必须选择检查部位");
            } else if (chosen.isEmpty()) resolution = "UNRESOLVED";
            else if (unresolved.isEmpty() && notes.isEmpty()) resolution = "MATCHED";
            else resolution = "PARTIAL";
            ExaminationChargePreview preview = "MATCHED".equals(resolution) || "NOT_REQUIRED".equals(resolution)
                    ? preview(serviceId, chosen.stream().map(ExaminationSitePrefill::code).toList()) : null;
            return new ExaminationSitePlan(resolution, List.copyOf(chosen), List.copyOf(unresolved),
                    notes.isEmpty() ? null : String.join("；", notes), preview);
        }

        /**
         * 部位名称 → 本项目的部位方式：先找绑定同一标准部位的部位方式（多个时按侧别挑选），再找名称相同的部位方式；
         * 都没有时沿上下级部位找唯一的部位方式作为待核对候选。
         */
        private ExaminationSitePrefill choose(ExaminationSiteRule rule, String name, String laterality) {
            String normalized = ClinicalTreatmentCatalogResolver.normalize(name);
            Long concept = conceptByTerm.get(normalized);
            Set<String> names = new HashSet<>(Set.of(normalized));
            if (concept != null) {
                var site = sites.get(concept);
                names.add(ClinicalTreatmentCatalogResolver.normalize(site.name()));
                site.aliases().forEach(alias -> names.add(ClinicalTreatmentCatalogResolver.normalize(alias)));
            }
            Long target = concept;
            var direct = rule.sites().stream().filter(option -> target != null && target.equals(option.bodySiteConceptId())
                    || option.bodySiteConceptId() == null && names.contains(ClinicalTreatmentCatalogResolver.normalize(option.name())))
                    .toList();
            ExaminationSiteOption picked = byLaterality(direct, laterality);
            if (picked != null) return new ExaminationSitePrefill(picked.code(), picked.name(), picked.variantId(), name, false);
            if (!direct.isEmpty() || concept == null) return null;
            Set<Long> related = new HashSet<>(ancestors(concept));
            related.addAll(descendants(concept));
            var nearby = rule.sites().stream().filter(option -> option.bodySiteConceptId() != null
                    && related.contains(option.bodySiteConceptId())).toList();
            return nearby.size() == 1 ? new ExaminationSitePrefill(nearby.getFirst().code(), nearby.getFirst().name(),
                    nearby.getFirst().variantId(), name, true) : null;
        }

        private ExaminationSiteOption byLaterality(List<ExaminationSiteOption> options, String laterality) {
            if (options.size() <= 1) return options.isEmpty() ? null : options.getFirst();
            String marker = laterality == null ? null : switch (laterality) {
                case "LEFT" -> "左"; case "RIGHT" -> "右"; default -> "双";
            };
            var narrowed = options.stream().filter(option -> marker == null
                    ? !option.name().matches(".*[左右双].*") : option.name().contains(marker)).toList();
            return narrowed.size() == 1 ? narrowed.getFirst() : null;
        }

        private Set<Long> ancestors(Long concept) {
            Set<Long> result = new HashSet<>();
            Deque<Long> pending = new ArrayDeque<>(sites.containsKey(concept) ? sites.get(concept).parentConceptIds() : List.of());
            while (!pending.isEmpty()) {
                Long current = pending.pop();
                if (result.add(current) && sites.containsKey(current)) pending.addAll(sites.get(current).parentConceptIds());
            }
            return result;
        }

        private Set<Long> descendants(Long concept) {
            Set<Long> result = new HashSet<>();
            Deque<Long> pending = new ArrayDeque<>(children.getOrDefault(concept, Set.of()));
            while (!pending.isEmpty()) {
                Long current = pending.pop();
                if (result.add(current)) pending.addAll(children.getOrDefault(current, Set.of()));
            }
            return result;
        }

        /** 按收费方案逐行取本机构销售价；任一行无价时合计为空，不推算金额。 */
        private ExaminationChargePreview preview(Long serviceId, List<String> codes) {
            try {
                var plan = examinations.chargePlan(serviceId, codes).orElse(null);
                if (plan == null) return null;
                List<ExaminationChargePreviewLine> lines = new ArrayList<>();
                boolean complete = true;
                for (var line : plan.lines()) {
                    if (!line.separatelyChargeable()) continue;
                    BigDecimal unitPrice = null, amount = null;
                    if (line.fixedAmount() != null) {
                        amount = line.fixedAmount();
                        unitPrice = amount.divide(line.quantity(), 6, RoundingMode.HALF_UP);
                    } else {
                        var snapshot = catalog.resolve(context.tenantId(), line.catalogItemId(), context.organizationId(), null, "SALE", date);
                        if (snapshot.price() != null && snapshot.item().chargeable()) {
                            unitPrice = snapshot.price().price();
                            amount = unitPrice.multiply(line.quantity());
                        }
                    }
                    complete &= amount != null;
                    lines.add(new ExaminationChargePreviewLine(line.sourceType(), line.catalogItemId(), line.itemCode(),
                            line.itemName(), line.quantity(), unitPrice, amount));
                }
                BigDecimal total = complete ? lines.stream().map(ExaminationChargePreviewLine::amount)
                        .reduce(BigDecimal.ZERO, BigDecimal::add) : null;
                return new ExaminationChargePreview(List.copyOf(lines), total);
            } catch (RuntimeException exception) {
                log.warn("clinical_ai_examination_preview_error correlationId={} serviceId={} errorType={}",
                        context.correlationId(), serviceId, exception.getClass().getSimpleName());
                return null;
            }
        }

        /** 同一推荐内落到同一开立项目的多条检查意图合并成一条，部位取并集。 */
        public TreatmentMatch merge(List<TreatmentMatch> group) {
            var first = group.getFirst();
            var candidate = first.candidates().getFirst();
            LinkedHashSet<String> sitesUnion = new LinkedHashSet<>();
            Set<String> lateralities = new HashSet<>();
            for (var match : group) {
                var exam = match.intent().examination();
                if (exam != null) { sitesUnion.addAll(requested(exam)); lateralities.add(Objects.toString(exam.laterality(), "")); }
            }
            var base = first.intent().examination();
            var exam = new ExaminationIntent(base == null ? null : base.modality(), base == null ? null : base.technique(),
                    base == null ? null : base.contrastPhase(), List.copyOf(sitesUnion),
                    lateralities.size() == 1 && base != null ? base.laterality() : null);
            var intent = new TreatmentRecommendation(first.intent().type(), null, null, null,
                    String.join("、", group.stream().map(match -> match.intent().name()).toList()), first.intent().specification(),
                    first.intent().rationale(), null, first.intent().purpose(), exam, null);
            var merged = new TreatmentRecommendation(candidate.type(), candidate.catalogItemId(), null, candidate.code(),
                    candidate.name(), candidate.specification(), candidate.rationale(), null, candidate.purpose(), null,
                    sitePlan(candidate.catalogItemId(), exam));
            return siteChecked(first.key(), intent, merged, "已合并为一次检查，按多部位计价");
        }

        void logOutcome(TreatmentMatch match) {
            var exam = match.intent().examination();
            var plan = match.candidates().size() == 1 ? match.candidates().getFirst().examinationSites() : null;
            // Only bounded structured fields; never prompts, records or patient identity.
            log.info("clinical_ai_examination_match correlationId={} modality={} technique={} contrastPhase={} bodySites={} "
                            + "outcome={} candidateIds={} siteResolution={} chargeItemIds={}",
                    context.correlationId(), exam == null ? null : exam.modality(), exam == null ? null : exam.technique(),
                    exam == null ? null : exam.contrastPhase(), exam == null ? List.of() : requested(exam), match.status(),
                    match.candidates().stream().limit(MAX_CANDIDATES).map(TreatmentRecommendation::catalogItemId).toList(),
                    plan == null ? null : plan.resolution(),
                    plan == null || plan.chargePreview() == null ? List.of()
                            : plan.chargePreview().lines().stream().map(ExaminationChargePreviewLine::catalogItemId).toList());
        }
    }

    static TreatmentRecommendation withExamination(TreatmentRecommendation intent, ExaminationIntent exam) {
        if (Objects.equals(intent.examination(), exam)) return intent;
        return new TreatmentRecommendation(intent.type(), intent.catalogItemId(), intent.medicationId(), intent.code(),
                intent.name(), intent.specification(), intent.rationale(), intent.usageSuggestion(), intent.purpose(),
                exam, intent.examinationSites());
    }

    private static List<String> requested(ExaminationIntent exam) {
        if (exam == null || exam.bodySites() == null) return List.of();
        return exam.bodySites().stream().filter(Objects::nonNull).map(String::trim).filter(value -> !value.isEmpty())
                .distinct().limit(6).toList();
    }

    /** 意图给出属性时优先完全一致的项目；没有一致项目时只保留未设置该属性的项目，不跨方式匹配。 */
    private static <T> List<T> prefer(List<T> items, java.util.function.Function<T, String> attribute, String wanted) {
        if (wanted == null) return items;
        var exact = items.stream().filter(item -> wanted.equals(attribute.apply(item))).toList();
        return exact.isEmpty() ? items.stream().filter(item -> attribute.apply(item) == null).toList() : exact;
    }
}
