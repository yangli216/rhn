package com.rhn.billing.application;

import com.rhn.billing.domain.ReliefFailurePolicy;
import com.rhn.billing.domain.ReliefMethod;
import com.rhn.billing.domain.ReliefPolicy;
import com.rhn.billing.domain.ReliefPolicyStatus;
import com.rhn.billing.domain.ReliefPolicyVersion;
import com.rhn.billing.domain.ReliefQualification;
import com.rhn.billing.domain.ReliefQualificationMode;
import com.rhn.billing.domain.ReliefQualificationSource;
import com.rhn.billing.domain.ReliefQuotaPeriod;
import com.rhn.billing.domain.ReliefRule;
import com.rhn.billing.domain.ReliefRuleTerms;
import com.rhn.billing.domain.ReliefScopeType;
import com.rhn.billing.domain.ReliefSponsor;
import com.rhn.billing.domain.ReliefTiming;
import com.rhn.billing.domain.ReliefVersionStatus;
import com.rhn.billing.infrastructure.ReliefPolicyRepository;
import com.rhn.billing.infrastructure.ReliefPolicyVersionRepository;
import com.rhn.billing.infrastructure.ReliefQualificationRepository;
import com.rhn.billing.infrastructure.ReliefRuleRepository;
import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import com.rhn.platform.dictionary.api.SystemEnumItem;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import com.rhn.shared.api.StaleRevisionException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

/**
 * 惠民政策维护：政策头 + 版本。每项政策至多一个草稿版本；发布后版本不可修改，再次编辑从当前版本复制出新草稿。
 * 规则与资格条件随草稿整体替换。政策头修订号用于并发控制，草稿的每次修改都会推进它。
 */
@Service
public class ReliefPolicyApplicationService {
    static final String QUALIFICATION_TYPE_DICTIONARY = "BIL_RELIEF_QUALIF_TYPE";
    private static final Set<String> NON_CHARGE_SOURCES = Set.of("DIRECT_REFUND", "MEDICATION_RETURN");

    private final ReliefPolicyRepository policies;
    private final ReliefPolicyVersionRepository versions;
    private final ReliefRuleRepository rules;
    private final ReliefQualificationRepository qualifications;
    private final ExecutionContextProvider contextProvider;
    private final DictionaryDirectory dictionaries;
    private final SystemEnumDirectory systemEnums;
    private final JsonCodec json;

    public ReliefPolicyApplicationService(ReliefPolicyRepository policies, ReliefPolicyVersionRepository versions,
                                          ReliefRuleRepository rules, ReliefQualificationRepository qualifications,
                                          ExecutionContextProvider contextProvider, DictionaryDirectory dictionaries,
                                          SystemEnumDirectory systemEnums, JsonCodec json) {
        this.policies = policies; this.versions = versions; this.rules = rules; this.qualifications = qualifications;
        this.contextProvider = contextProvider; this.dictionaries = dictionaries; this.systemEnums = systemEnums;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public List<ReliefPolicySummaryView> list() {
        ExecutionContext context = contextProvider.requireCurrent();
        List<ReliefPolicy> values = policies.findByTenantIdOrderByCodeAsc(context.tenantId());
        Map<Long, List<ReliefPolicyVersion>> byPolicy = new HashMap<>();
        for (ReliefPolicy policy : values) {
            byPolicy.put(policy.id(), versions.findByTenantIdAndPolicyIdOrderByVersionNoDesc(context.tenantId(), policy.id()));
        }
        return values.stream().map(policy -> summary(policy, byPolicy.get(policy.id()))).toList();
    }

    @Transactional(readOnly = true)
    public ReliefPolicyView get(Long policyId) {
        ExecutionContext context = contextProvider.requireCurrent();
        return view(context, requirePolicy(context, policyId));
    }

    @Transactional
    public ReliefPolicyView create(ReliefCreatePolicyCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        String code = requiredText(input.code(), "RELIEF_POLICY_CODE_REQUIRED", "政策编码不能为空").toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9_\\-]{1,64}")) {
            throw badRequest("RELIEF_POLICY_CODE_INVALID", "政策编码只能包含字母、数字、下划线和连字符");
        }
        if (policies.findByTenantIdAndCode(context.tenantId(), code).isPresent()) {
            throw conflict("RELIEF_POLICY_CODE_DUPLICATE", "政策编码已存在");
        }
        Instant now = Instant.now();
        ReliefPolicy policy = policies.save(new ReliefPolicy(context.tenantId(), code,
                requiredText(input.name(), "RELIEF_POLICY_NAME_REQUIRED", "政策名称不能为空"),
                trimToNull(input.description()), context.subjectId(), now));
        saveDraft(context, policy, 1, input.draft(), now);
        return view(context, policy);
    }

    /** 修改草稿；没有草稿时以提交内容新建下一版本草稿。 */
    @Transactional
    public ReliefPolicyView updateDraft(Long policyId, ReliefUpdateDraftCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        ReliefPolicy policy = requirePolicy(context, policyId);
        requireRevision(policy, input.expectedRevision());
        if (policy.status() == ReliefPolicyStatus.RETIRED) throw conflict("RELIEF_POLICY_RETIRED", "已停用的政策不能修改");
        Instant now = Instant.now();
        policy.rename(requiredText(input.name(), "RELIEF_POLICY_NAME_REQUIRED", "政策名称不能为空"),
                trimToNull(input.description()), context.subjectId(), now);
        List<ReliefPolicyVersion> history = versions.findByTenantIdAndPolicyIdOrderByVersionNoDesc(context.tenantId(), policyId);
        ReliefPolicyVersion draft = draftOf(history);
        if (draft == null) {
            int next = history.isEmpty() ? 1 : history.get(0).versionNo() + 1;
            saveDraft(context, policy, next, input.draft(), now);
        } else {
            draft.revise(terms(context, input.draft()));
            rules.deleteByTenantIdAndPolicyVersionId(context.tenantId(), draft.id());
            qualifications.deleteByTenantIdAndPolicyVersionId(context.tenantId(), draft.id());
            rules.flush(); qualifications.flush();
            saveChildren(context, draft, input.draft());
        }
        return view(context, policy);
    }

    @Transactional
    public ReliefPolicyView discardDraft(Long policyId, ReliefRevisionCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        ReliefPolicy policy = requirePolicy(context, policyId);
        requireRevision(policy, input.expectedRevision());
        List<ReliefPolicyVersion> history = versions.findByTenantIdAndPolicyIdOrderByVersionNoDesc(context.tenantId(), policyId);
        ReliefPolicyVersion draft = draftOf(history);
        if (draft == null) throw conflict("RELIEF_POLICY_DRAFT_MISSING", "当前政策没有草稿版本");
        if (history.size() == 1) throw conflict("RELIEF_POLICY_DRAFT_ONLY", "政策尚未发布，不能放弃唯一的草稿版本");
        rules.deleteByTenantIdAndPolicyVersionId(context.tenantId(), draft.id());
        qualifications.deleteByTenantIdAndPolicyVersionId(context.tenantId(), draft.id());
        versions.delete(draft);
        policy.rename(policy.name(), policy.description(), context.subjectId(), Instant.now());
        return view(context, policy);
    }

    /** 发布草稿：校验完整性，原发布版本转为已替代，政策进入生效。 */
    @Transactional
    public ReliefPolicyView publish(Long policyId, ReliefRevisionCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        ReliefPolicy policy = requirePolicy(context, policyId);
        requireRevision(policy, input.expectedRevision());
        List<ReliefPolicyVersion> history = versions.findByTenantIdAndPolicyIdOrderByVersionNoDesc(context.tenantId(), policyId);
        ReliefPolicyVersion draft = draftOf(history);
        if (draft == null) throw conflict("RELIEF_POLICY_DRAFT_MISSING", "当前政策没有待发布的草稿版本");
        List<ReliefRule> draftRules = rules.findByTenantIdAndPolicyVersionIdOrderByLineNoAsc(context.tenantId(), draft.id());
        if (draftRules.stream().noneMatch(rule -> !rule.terms().excluded())) {
            throw badRequest("RELIEF_POLICY_RULE_REQUIRED", "发布前至少需要一条减免规则");
        }
        if (qualifications.findByTenantIdAndPolicyVersionIdOrderByLineNoAsc(context.tenantId(), draft.id()).isEmpty()) {
            throw badRequest("RELIEF_POLICY_QUALIFICATION_REQUIRED", "发布前至少需要一项资格条件");
        }
        Instant now = Instant.now();
        history.stream().filter(value -> value.status() == ReliefVersionStatus.PUBLISHED)
                .forEach(ReliefPolicyVersion::supersede);
        draft.publish(context.subjectId(), now);
        policy.publish(draft, context.subjectId(), now);
        return view(context, policy);
    }

    @Transactional
    public ReliefPolicyView suspend(Long policyId, ReliefRevisionCommand input) {
        return transition(policyId, input, (policy, context, now) -> policy.suspend(context.subjectId(), now));
    }

    @Transactional
    public ReliefPolicyView resume(Long policyId, ReliefRevisionCommand input) {
        return transition(policyId, input, (policy, context, now) -> policy.resume(context.subjectId(), now));
    }

    @Transactional
    public ReliefPolicyView retire(Long policyId, ReliefRevisionCommand input) {
        return transition(policyId, input, (policy, context, now) -> policy.retire(context.subjectId(), now));
    }

    private interface Transition { void apply(ReliefPolicy policy, ExecutionContext context, Instant now); }

    private ReliefPolicyView transition(Long policyId, ReliefRevisionCommand input, Transition transition) {
        ExecutionContext context = contextProvider.requireCurrent();
        ReliefPolicy policy = requirePolicy(context, policyId);
        requireRevision(policy, input.expectedRevision());
        transition.apply(policy, context, Instant.now());
        return view(context, policy);
    }

    private void saveDraft(ExecutionContext context, ReliefPolicy policy, int versionNo, ReliefDraftInput draft, Instant now) {
        ReliefPolicyVersion version = versions.save(new ReliefPolicyVersion(context.tenantId(), policy.id(), versionNo,
                terms(context, draft), context.subjectId(), now));
        saveChildren(context, version, draft);
    }

    private void saveChildren(ExecutionContext context, ReliefPolicyVersion version, ReliefDraftInput draft) {
        List<ReliefRuleInput> ruleInputs = draft.rules() == null ? List.of() : draft.rules();
        Map<String, String> categories = null;
        Set<String> sources = null;
        Set<String> scopeKeys = new HashSet<>();
        int lineNo = 1;
        for (ReliefRuleInput input : ruleInputs) {
            String name = trimToNull(input.scopeName());
            String value = trimToNull(input.scopeValue());
            if (input.feeScope() == ReliefScopeType.ACCOUNTING_CATEGORY) {
                if (categories == null) categories = dictionaries.resolveItemTexts(context.tenantId(), MasterDataDictionaryCodes.ACCOUNTING_CATEGORY);
                if (value == null || !categories.containsKey(value)) {
                    throw badRequest("RELIEF_RULE_CATEGORY_INVALID", "会计大类不存在：" + value);
                }
                name = categories.get(value);
            } else if (input.feeScope() == ReliefScopeType.SOURCE_TYPE) {
                if (sources == null) sources = chargeSources();
                if (value == null || !sources.contains(value)) throw badRequest("RELIEF_RULE_SOURCE_INVALID", "收费来源不正确：" + value);
            } else if (input.feeScope() == ReliefScopeType.CATALOG_ITEM && name == null) {
                throw badRequest("RELIEF_RULE_ITEM_NAME_REQUIRED", "收费项目规则必须提供项目名称");
            }
            ReliefRuleTerms terms = new ReliefRuleTerms(input.feeScope(), value, input.catalogItemId(), name,
                    Boolean.TRUE.equals(input.excluded()), input.method(), input.ratio(), input.amount(), input.manualMaxAmount(),
                    input.periodMaxCount());
            terms.validate();
            if (!scopeKeys.add((terms.excluded() ? "EXCLUDE:" : "INCLUDE:") + terms.scopeKey())) {
                throw badRequest("RELIEF_RULE_DUPLICATE", "同一费用范围不能重复配置：" + (name == null ? terms.scopeKey() : name));
            }
            if (terms.periodMaxCount() != null && version.quotaPeriod() == ReliefQuotaPeriod.NONE) {
                throw badRequest("RELIEF_RULE_PERIOD_REQUIRED", "设置项目周期次数时，政策必须选择额度周期");
            }
            if (terms.method() == ReliefMethod.MANUAL && version.timing() == ReliefTiming.PRE_INSURANCE) {
                throw badRequest("RELIEF_RULE_MANUAL_TIMING", "人工核准只用于医保后减免，避免改变医保结算金额");
            }
            rules.save(new ReliefRule(context.tenantId(), version.id(), lineNo++, terms));
        }
        List<ReliefQualificationInput> qualificationInputs = draft.qualifications() == null ? List.of() : draft.qualifications();
        Map<String, String> qualificationTypes = null;
        lineNo = 1;
        for (ReliefQualificationInput input : qualificationInputs) {
            if (input.source() == null) throw badRequest("RELIEF_QUALIFICATION_SOURCE_REQUIRED", "资格条件必须指定来源");
            String type = trimToNull(input.qualificationType());
            if (type != null) {
                if (qualificationTypes == null) qualificationTypes = dictionaries.resolveItemTexts(context.tenantId(), QUALIFICATION_TYPE_DICTIONARY);
                if (!qualificationTypes.containsKey(type)) throw badRequest("RELIEF_QUALIFICATION_TYPE_INVALID", "资格类别不存在：" + type);
            }
            String conditions = input.conditions() == null ? null : json.write(input.conditions().validated());
            qualifications.save(new ReliefQualification(context.tenantId(), version.id(), lineNo++, input.source(),
                    type, conditions, trimToNull(input.providerCode()), input.failurePolicy()));
        }
        if (qualificationInputs.stream().anyMatch(value -> value.source() == ReliefQualificationSource.ALL)
                && qualificationInputs.size() > 1) {
            throw badRequest("RELIEF_QUALIFICATION_ALL_EXCLUSIVE", "“全部患者”不能与其他资格条件组合");
        }
    }

    private ReliefPolicyVersion.Terms terms(ExecutionContext context, ReliefDraftInput draft) {
        if (draft == null) throw badRequest("RELIEF_POLICY_DRAFT_REQUIRED", "必须提供政策版本内容");
        ReliefApplicableScope scope = draft.scope() == null ? new ReliefApplicableScope(List.of(), List.of()) : draft.scope();
        Set<String> knownScenes = enumCodes("BIL_SETTLEMENT_SCENE");
        List<String> scenes = scope.scenes() == null ? List.of() : scope.scenes().stream().distinct().sorted().toList();
        if (scenes.isEmpty()) throw badRequest("RELIEF_POLICY_SCENE_REQUIRED", "必须选择至少一个适用结算场景");
        for (String scene : scenes) {
            if (!knownScenes.contains(scene)) throw badRequest("RELIEF_POLICY_SCENE_INVALID", "结算场景不正确：" + scene);
        }
        List<Long> organizations = scope.organizationIds() == null ? List.of()
                : scope.organizationIds().stream().distinct().sorted().toList();
        for (Long organizationId : organizations) {
            if (organizationId == null || organizationId <= 0) {
                throw badRequest("RELIEF_POLICY_ORGANIZATION_INVALID", "适用机构不正确");
            }
        }
        String mutexGroup = trimToNull(draft.mutexGroup());
        return new ReliefPolicyVersion.Terms(draft.timing(), draft.sponsor(), trimToNull(draft.payerCode()),
                trimToNull(draft.payerName()), json.write(new ReliefApplicableScope(organizations, scenes)),
                draft.effectiveFrom(), draft.effectiveTo(), draft.priority() == null ? 100 : draft.priority(),
                mutexGroup == null ? null : mutexGroup.toUpperCase(Locale.ROOT),
                draft.stackable() == null || draft.stackable(),
                draft.qualificationMode() == null ? ReliefQualificationMode.ANY : draft.qualificationMode(),
                Boolean.TRUE.equals(draft.insuredApplicable()), Boolean.TRUE.equals(draft.baseIncludesPersonalAccount()),
                draft.onceMaxAmount(), draft.quotaPeriod() == null ? ReliefQuotaPeriod.NONE : draft.quotaPeriod(),
                draft.periodMaxAmount(), draft.periodMaxCount(), Boolean.TRUE.equals(draft.shareAcrossScenes()),
                Boolean.TRUE.equals(draft.shareAcrossOrganizations()), trimToNull(draft.versionNote()));
    }

    private Set<String> chargeSources() {
        return enumCodes("BIL_CHARGE_SOURCE_TYPE").stream()
                .filter(code -> !code.endsWith("_REVERSAL") && !NON_CHARGE_SOURCES.contains(code))
                .collect(Collectors.toCollection(TreeSet::new));
    }

    private Set<String> enumCodes(String code) {
        return systemEnums.findSystemEnum(code).orElseThrow(() -> new IllegalStateException("系统枚举缺失：" + code))
                .items().stream().map(SystemEnumItem::code).collect(Collectors.toSet());
    }

    private ReliefPolicy requirePolicy(ExecutionContext context, Long policyId) {
        return policies.findByIdAndTenantId(policyId, context.tenantId())
                .orElseThrow(() -> notFound("RELIEF_POLICY_NOT_FOUND", "未找到惠民政策"));
    }

    private static void requireRevision(ReliefPolicy policy, Long expectedRevision) {
        if (expectedRevision == null) throw badRequest("RELIEF_POLICY_REVISION_REQUIRED", "必须提供政策修订号");
        if (policy.revision() != expectedRevision) throw new StaleRevisionException(policy.revision(), "政策已被其他用户修改，请刷新后重试");
    }

    private static ReliefPolicyVersion draftOf(List<ReliefPolicyVersion> history) {
        return history.stream().filter(value -> value.status() == ReliefVersionStatus.DRAFT).findFirst().orElse(null);
    }

    private ReliefPolicySummaryView summary(ReliefPolicy policy, List<ReliefPolicyVersion> history) {
        ReliefPolicyVersion current = history.stream().filter(value -> value.id().equals(policy.currentVersionId()))
                .findFirst().orElse(null);
        ReliefPolicyVersion shown = current != null ? current : draftOf(history);
        return new ReliefPolicySummaryView(policy.id(), policy.revision(), policy.code(), policy.name(), policy.status().name(),
                current == null ? null : current.versionNo(), shown == null ? null : shown.timing().name(),
                shown == null ? null : shown.sponsor().name(), shown == null ? null : shown.effectiveFrom(),
                shown == null ? null : shown.effectiveTo(), draftOf(history) != null, policy.updatedAt());
    }

    private ReliefPolicyView view(ExecutionContext context, ReliefPolicy policy) {
        policies.flush();
        List<ReliefPolicyVersion> history = versions.findByTenantIdAndPolicyIdOrderByVersionNoDesc(context.tenantId(), policy.id());
        ReliefPolicyVersion current = history.stream().filter(value -> value.id().equals(policy.currentVersionId()))
                .findFirst().orElse(null);
        ReliefPolicyVersion draft = draftOf(history);
        return new ReliefPolicyView(policy.id(), policy.revision(), policy.code(), policy.name(), policy.description(),
                policy.status().name(), policy.currentVersionId(),
                history.stream().map(value -> new ReliefVersionSummaryView(value.id(), value.versionNo(), value.status().name(),
                        value.effectiveFrom(), value.effectiveTo(), value.createdAt(), value.publishedAt())).toList(),
                current == null ? null : versionView(context, current), draft == null ? null : versionView(context, draft),
                policy.updatedAt());
    }

    private ReliefVersionView versionView(ExecutionContext context, ReliefPolicyVersion version) {
        List<ReliefRuleView> ruleViews = rules.findByTenantIdAndPolicyVersionIdOrderByLineNoAsc(context.tenantId(), version.id())
                .stream().sorted(Comparator.comparingInt(ReliefRule::lineNo)).map(rule -> {
                    ReliefRuleTerms terms = rule.terms();
                    return new ReliefRuleView(rule.id(), rule.lineNo(), terms.scopeType().name(), terms.scopeValue(),
                            terms.catalogItemId(), terms.scopeName(), terms.excluded(),
                            terms.method() == null ? null : terms.method().name(), terms.ratio(), terms.amount(),
                            terms.manualMaxAmount(), terms.periodMaxCount());
                }).toList();
        List<ReliefQualificationView> qualificationViews = qualifications
                .findByTenantIdAndPolicyVersionIdOrderByLineNoAsc(context.tenantId(), version.id()).stream()
                .map(value -> new ReliefQualificationView(value.id(), value.lineNo(), value.source().name(),
                        value.qualificationType(),
                        value.conditionsJson() == null ? null : json.read(value.conditionsJson(), ReliefAttributeConditions.class),
                        value.providerCode(), value.failurePolicy() == null ? null : value.failurePolicy().name()))
                .toList();
        return new ReliefVersionView(version.id(), version.versionNo(), version.status().name(), version.timing().name(),
                version.sponsor().name(), version.payerCode(), version.payerName(),
                json.read(version.applicableScopeJson(), ReliefApplicableScope.class), version.effectiveFrom(),
                version.effectiveTo(), version.priority(), version.mutexGroup(), version.stackable(),
                version.qualificationMode().name(), version.insuredApplicable(), version.baseIncludesPersonalAccount(),
                version.onceMaxAmount(), version.quotaPeriod().name(), version.periodMaxAmount(), version.periodMaxCount(),
                version.shareAcrossScenes(), version.shareAcrossOrganizations(), version.versionNote(), ruleViews,
                qualificationViews, version.createdAt(), version.publishedAt());
    }

    private static String requiredText(String value, String code, String message) {
        String trimmed = trimToNull(value);
        if (trimmed == null) throw badRequest(code, message);
        return trimmed;
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record ReliefApplicableScope(List<Long> organizationIds, List<String> scenes) {}

    /** 属性资格条件；未设置的条件不参与判断。 */
    public record ReliefAttributeConditions(Integer minAge, Integer maxAge, List<String> genders, List<String> coverageTypes) {
        ReliefAttributeConditions validated() {
            if ((minAge != null && minAge < 0) || (maxAge != null && maxAge < 0)
                    || (minAge != null && maxAge != null && maxAge < minAge)) {
                throw badRequest("RELIEF_QUALIFICATION_AGE_INVALID", "年龄条件不正确");
            }
            if (minAge == null && maxAge == null && (genders == null || genders.isEmpty())
                    && (coverageTypes == null || coverageTypes.isEmpty())) {
                throw badRequest("RELIEF_QUALIFICATION_CONDITION_REQUIRED", "属性资格至少需要一个条件");
            }
            return new ReliefAttributeConditions(minAge, maxAge, genders == null ? List.of() : List.copyOf(new TreeSet<>(genders)),
                    coverageTypes == null ? List.of() : List.copyOf(new TreeSet<>(coverageTypes)));
        }
    }

    public record ReliefRuleInput(ReliefScopeType feeScope, String scopeValue, Long catalogItemId, String scopeName,
                            Boolean excluded, ReliefMethod method, BigDecimal ratio, BigDecimal amount,
                            BigDecimal manualMaxAmount, Integer periodMaxCount) {}

    public record ReliefQualificationInput(ReliefQualificationSource source, String qualificationType,
                                     ReliefAttributeConditions conditions, String providerCode,
                                     ReliefFailurePolicy failurePolicy) {}

    public record ReliefDraftInput(ReliefTiming timing, ReliefSponsor sponsor, String payerCode, String payerName,
                             ReliefApplicableScope scope, LocalDate effectiveFrom, LocalDate effectiveTo, Integer priority,
                             String mutexGroup, Boolean stackable, ReliefQualificationMode qualificationMode,
                             Boolean insuredApplicable, Boolean baseIncludesPersonalAccount, BigDecimal onceMaxAmount,
                             ReliefQuotaPeriod quotaPeriod, BigDecimal periodMaxAmount, Integer periodMaxCount,
                             Boolean shareAcrossScenes, Boolean shareAcrossOrganizations, String versionNote,
                             List<ReliefRuleInput> rules, List<ReliefQualificationInput> qualifications) {}

    public record ReliefCreatePolicyCommand(String code, String name, String description, ReliefDraftInput draft) {}

    public record ReliefUpdateDraftCommand(Long expectedRevision, String name, String description, ReliefDraftInput draft) {}

    public record ReliefRevisionCommand(Long expectedRevision) {}

    public record ReliefPolicySummaryView(Long id, long revision, String code, String name,
                                    @DictionaryBinding("BIL_RELIEF_POLICY_STATUS") String status,
                                    Integer currentVersionNo,
                                    @DictionaryBinding("BIL_RELIEF_TIMING") String timing,
                                    @DictionaryBinding("BIL_RELIEF_SPONSOR") String sponsor,
                                    LocalDate effectiveFrom, LocalDate effectiveTo, boolean hasDraft,
                                    Instant updatedAt) {}

    public record ReliefVersionSummaryView(Long id, int versionNo,
                                     @DictionaryBinding("BIL_RELIEF_VERSION_STATUS") String status,
                                     LocalDate effectiveFrom, LocalDate effectiveTo, Instant createdAt,
                                     Instant publishedAt) {}

    public record ReliefRuleView(Long id, int lineNo, @DictionaryBinding("BIL_RELIEF_SCOPE_TYPE") String feeScope,
                           String scopeValue, Long catalogItemId, String scopeName, boolean excluded,
                           @DictionaryBinding("BIL_RELIEF_METHOD") String method, BigDecimal ratio,
                           BigDecimal amount, BigDecimal manualMaxAmount, Integer periodMaxCount) {}

    public record ReliefQualificationView(Long id, int lineNo,
                                    @DictionaryBinding("BIL_RELIEF_QUALIFICATION_SOURCE") String source,
                                    @DictionaryBinding(QUALIFICATION_TYPE_DICTIONARY) String qualificationType,
                                    ReliefAttributeConditions conditions, String providerCode,
                                    @DictionaryBinding("BIL_RELIEF_FAILURE_POLICY") String failurePolicy) {}

    public record ReliefVersionView(Long id, int versionNo, @DictionaryBinding("BIL_RELIEF_VERSION_STATUS") String status,
                              @DictionaryBinding("BIL_RELIEF_TIMING") String timing,
                              @DictionaryBinding("BIL_RELIEF_SPONSOR") String sponsor, String payerCode,
                              String payerName, ReliefApplicableScope scope, LocalDate effectiveFrom, LocalDate effectiveTo,
                              int priority, String mutexGroup, boolean stackable,
                              @DictionaryBinding("BIL_RELIEF_QUALIFICATION_MODE") String qualificationMode,
                              boolean insuredApplicable, boolean baseIncludesPersonalAccount, BigDecimal onceMaxAmount,
                              @DictionaryBinding("BIL_RELIEF_QUOTA_PERIOD") String quotaPeriod,
                              BigDecimal periodMaxAmount, Integer periodMaxCount, boolean shareAcrossScenes,
                              boolean shareAcrossOrganizations, String versionNote, List<ReliefRuleView> rules,
                              List<ReliefQualificationView> qualifications, Instant createdAt, Instant publishedAt) {}

    public record ReliefPolicyView(Long id, long revision, String code, String name, String description,
                             @DictionaryBinding("BIL_RELIEF_POLICY_STATUS") String status, Long currentVersionId,
                             List<ReliefVersionSummaryView> versions, ReliefVersionView current, ReliefVersionView draft,
                             Instant updatedAt) {}
}
