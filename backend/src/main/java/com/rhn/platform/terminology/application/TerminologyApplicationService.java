package com.rhn.platform.terminology.application;

import com.rhn.platform.terminology.api.CodeSystemSummary;
import com.rhn.platform.terminology.api.ConceptAliasView;
import com.rhn.platform.terminology.api.ConceptView;
import com.rhn.platform.terminology.api.DiseaseConceptView;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.platform.terminology.api.TerminologyConceptSnapshot;
import com.rhn.platform.terminology.domain.CodeSystem;
import com.rhn.platform.terminology.domain.Concept;
import com.rhn.platform.terminology.domain.ConceptAlias;
import com.rhn.platform.terminology.domain.TerminologyScope;
import com.rhn.platform.terminology.domain.TerminologyStatus;
import com.rhn.platform.terminology.domain.TerminologyCodePolicy;
import com.rhn.platform.terminology.domain.ValueSet;
import com.rhn.platform.terminology.domain.ValueSetMember;
import com.rhn.platform.terminology.infrastructure.CodeSystemRepository;
import com.rhn.platform.terminology.infrastructure.ConceptRepository;
import com.rhn.platform.terminology.infrastructure.ConceptAliasRepository;
import com.rhn.platform.terminology.infrastructure.ValueSetMemberRepository;
import com.rhn.platform.terminology.infrastructure.ValueSetRepository;
import com.rhn.shared.api.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Service
public class TerminologyApplicationService implements TerminologyDirectory {
    public static final Long PRODUCT_SCOPE_ID = 0L;

    private final CodeSystemRepository codeSystemRepository;
    private final ConceptRepository conceptRepository;
    private final ConceptAliasRepository aliasRepository;
    private final ValueSetRepository valueSetRepository;
    private final ValueSetMemberRepository memberRepository;

    public TerminologyApplicationService(CodeSystemRepository codeSystemRepository,
                                         ConceptRepository conceptRepository,
                                         ConceptAliasRepository aliasRepository,
                                         ValueSetRepository valueSetRepository,
                                         ValueSetMemberRepository memberRepository) {
        this.codeSystemRepository = codeSystemRepository;
        this.conceptRepository = conceptRepository;
        this.aliasRepository = aliasRepository;
        this.valueSetRepository = valueSetRepository;
        this.memberRepository = memberRepository;
    }

    @Transactional
    public Long createCodeSystem(Long tenantId, boolean productScope, String code, String name, String canonicalUri,
                                 String version, LocalDate effectiveFrom, LocalDate effectiveTo) {
        return createCodeSystem(tenantId, productScope, code, name, canonicalUri, version, "COMMON", null, null,
                effectiveFrom, effectiveTo);
    }

    @Transactional
    public Long createCodeSystem(Long tenantId, boolean productScope, String code, String name, String canonicalUri,
                                 String version, String systemType, String publisher, String description,
                                 LocalDate effectiveFrom, LocalDate effectiveTo) {
        return createCodeSystem(tenantId, productScope, code, name, canonicalUri, version, systemType, publisher,
                description, "INTERNAL", null, null, effectiveFrom, effectiveTo);
    }

    @Transactional
    public Long createCodeSystem(Long tenantId, boolean productScope, String code, String name, String canonicalUri,
                                 String version, String systemType, String publisher, String description,
                                 String authorityType, String sourceUri, String contentHash,
                                 LocalDate effectiveFrom, LocalDate effectiveTo) {
        if (!Set.of("NATIONAL", "INSURANCE", "REGULATORY", "LOCAL", "INTERNAL", "OTHER")
                .contains(authorityType == null ? "INTERNAL" : authorityType)) {
            throw badRequest("CODE_SYSTEM_AUTHORITY_INVALID", "标准发布权威类型不正确");
        }
        CodeSystem system = new CodeSystem(productScope ? TerminologyScope.PRODUCT : TerminologyScope.TENANT,
                productScope ? PRODUCT_SCOPE_ID : tenantId, code, name, canonicalUri, version,
                systemType, publisher, description, authorityType, sourceUri, contentHash,
                effectiveFrom, effectiveTo);
        return codeSystemRepository.save(system).id();
    }

    @Transactional
    public ConceptView addConcept(Long codeSystemId, String code, String display, String definition,
                                  LocalDate effectiveFrom, LocalDate effectiveTo) {
        CodeSystem system = codeSystemRepository.findById(codeSystemId)
                .orElseThrow(() -> notFound("CODE_SYSTEM_NOT_FOUND", "未找到编码体系"));
        if (conceptRepository.findByCodeSystemIdAndCode(codeSystemId, code).isPresent()) {
            throw conflict("CONCEPT_CODE_DUPLICATE", "概念代码已经存在于该编码体系");
        }
        TerminologyCodePolicy.requireConceptCode(system.code(), code);
        Concept concept = conceptRepository.save(new Concept(codeSystemId, code, display, definition,
                effectiveFrom, effectiveTo));
        return concept.toView(system);
    }

    @Transactional
    public void activateCodeSystem(Long codeSystemId) {
        codeSystemRepository.findById(codeSystemId)
                .orElseThrow(() -> notFound("CODE_SYSTEM_NOT_FOUND", "未找到编码体系"))
                .activate();
    }

    @Transactional
    public void activateConcept(Long conceptId) {
        conceptRepository.findById(conceptId)
                .orElseThrow(() -> notFound("CONCEPT_NOT_FOUND", "未找到术语概念"))
                .activate();
    }

    @Transactional
    public Long createValueSet(Long tenantId, boolean productScope, String code, String name, String version,
                               LocalDate effectiveFrom, LocalDate effectiveTo) {
        ValueSet valueSet = new ValueSet(productScope ? TerminologyScope.PRODUCT : TerminologyScope.TENANT,
                productScope ? PRODUCT_SCOPE_ID : tenantId, code, name, version, effectiveFrom, effectiveTo);
        if (!productScope && TerminologyCodePolicy.isRhnOwned(valueSet.code())
                && !valueSetRepository.existsByScopeTypeAndScopeIdAndCode(
                        TerminologyScope.PRODUCT, PRODUCT_SCOPE_ID, valueSet.code())) {
            throw new BusinessException("VALUE_SET_PRODUCT_BASE_REQUIRED",
                    "租户只能覆盖已经存在的 RHN 产品值域；新建私有值域请使用 LOCAL OWNER",
                    HttpStatus.BAD_REQUEST);
        }
        return valueSetRepository.save(valueSet).id();
    }

    @Transactional
    public void addValueSetMember(Long valueSetId, Long conceptId, int sortOrder) {
        if (!valueSetRepository.existsById(valueSetId)) {
            throw notFound("VALUE_SET_NOT_FOUND", "未找到值域");
        }
        if (!conceptRepository.existsById(conceptId)) {
            throw notFound("CONCEPT_NOT_FOUND", "未找到术语概念");
        }
        memberRepository.save(new ValueSetMember(valueSetId, conceptId, sortOrder));
    }

    @Transactional
    public void activateValueSet(Long valueSetId) {
        valueSetRepository.findById(valueSetId)
                .orElseThrow(() -> notFound("VALUE_SET_NOT_FOUND", "未找到值域"))
                .activate();
    }

    @Override
    @Transactional(readOnly = true)
    public ConceptView requireValueSetMember(Long tenantId, String valueSetCode, String conceptCode,
                                             LocalDate atDate) {
        return expandValueSet(tenantId, valueSetCode, atDate).stream()
                .filter(concept -> concept.code().equals(conceptCode))
                .findFirst()
                .orElseThrow(() -> new BusinessException("VALUE_SET_MEMBER_INVALID",
                        "代码 " + conceptCode + " 不属于值域 " + valueSetCode, HttpStatus.BAD_REQUEST));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ConceptView> expandValueSet(Long tenantId, String valueSetCode, LocalDate atDate) {
        ValueSet valueSet = findValueSet(tenantId, valueSetCode, atDate);
        return memberRepository.findConcepts(valueSet.id()).stream()
                .filter(concept -> concept.isActive() && concept.isEffectiveAt(atDate))
                .map(concept -> {
                    CodeSystem system = codeSystemRepository.findById(concept.codeSystemId())
                            .orElseThrow(() -> new IllegalStateException("Concept code system is missing"));
                    return concept.toView(system);
                })
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public TerminologyConceptSnapshot requireConcept(Long tenantId, String codeSystemCode, String conceptCode,
                                                     LocalDate atDate) {
        CodeSystem system = visibleSystems(tenantId, codeSystemCode, atDate).stream().findFirst()
                .orElseThrow(() -> notFound("CODE_SYSTEM_NOT_FOUND", "未找到当前有效的编码体系 " + codeSystemCode));
        Concept concept = conceptRepository.findByCodeSystemIdAndCode(system.id(), conceptCode)
                .filter(Concept::isActive)
                .filter(value -> value.isEffectiveAt(atDate))
                .orElseThrow(() -> notFound("CONCEPT_NOT_FOUND", "未找到当前有效的术语概念 " + conceptCode));
        return new TerminologyConceptSnapshot(concept.id(), system.code(), system.canonicalUri(),
                system.versionCode(), concept.code(), concept.display());
    }

    @Transactional(readOnly = true)
    public List<CodeSystemSummary> listDiseaseCodeSystems(Long tenantId) {
        return visibleDiseaseSystems(tenantId).stream()
                .map(system -> new CodeSystemSummary(system.id(), system.revision(), system.code(), system.name(),
                        system.versionCode(), system.status().name(), system.effectiveFrom(), system.effectiveTo(),
                        system.publisher()))
                .sorted(Comparator.comparing(CodeSystemSummary::name))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DiseaseConceptView> listDiseases(Long tenantId, String query, String conceptType,
                                                 TerminologyStatus status) {
        List<CodeSystem> systems = visibleDiseaseSystems(tenantId);
        if (systems.isEmpty()) return List.of();
        Map<Long, CodeSystem> systemById = systems.stream()
                .collect(Collectors.toMap(CodeSystem::id, Function.identity()));
        List<Concept> concepts = conceptRepository.findByCodeSystemIdInOrderByDisplay(systemById.keySet());
        Map<Long, List<ConceptAlias>> aliases = aliasesByConcept(concepts.stream().map(Concept::id).toList());
        String normalized = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        return concepts.stream()
                .filter(value -> conceptType == null || conceptType.isBlank() || conceptType.equals(value.conceptType()))
                .filter(value -> status == null || status == value.status())
                .filter(value -> normalized.isBlank()
                        || matches(value, aliases.getOrDefault(value.id(), List.of()), normalized))
                .limit(500)
                .map(value -> diseaseView(value, systemById.get(value.codeSystemId()),
                        aliases.getOrDefault(value.id(), List.of())))
                .toList();
    }

    @Transactional
    public DiseaseConceptView createDisease(Long tenantId, Long codeSystemId, String code, String display,
                                            String shortDisplay, String conceptType, String chapterCode,
                                            String chapterName, String definition, String searchCode,
                                            LocalDate effectiveFrom, LocalDate effectiveTo,
                                            TerminologyStatus status, Collection<String> aliases) {
        CodeSystem system = requireVisibleDiseaseSystem(tenantId, codeSystemId);
        if (conceptRepository.findByCodeSystemIdAndCode(codeSystemId, code).isPresent()) {
            throw conflict("DISEASE_CODE_DUPLICATE", "当前编码体系版本下已存在相同疾病代码");
        }
        TerminologyCodePolicy.requireConceptCode(system.code(), code);
        Concept concept = conceptRepository.save(new Concept(codeSystemId, code, display, definition, conceptType,
                shortDisplay, chapterCode, chapterName, searchCode, effectiveFrom, effectiveTo,
                status == null ? TerminologyStatus.DRAFT : status));
        saveNewAliases(concept.id(), aliases);
        return diseaseView(concept, system, aliasRepository.findByConceptIdOrderByAliasName(concept.id()));
    }

    @Transactional
    public DiseaseConceptView updateDisease(Long tenantId, Long id, long expectedRevision, String display,
                                            String shortDisplay, String conceptType, String chapterCode,
                                            String chapterName, String definition, String searchCode,
                                            LocalDate effectiveFrom, LocalDate effectiveTo,
                                            Collection<String> aliases) {
        Concept concept = requireDisease(tenantId, id);
        requireRevision(concept, expectedRevision);
        concept.update(expectedRevision, display, definition, conceptType, shortDisplay, chapterCode,
                chapterName, searchCode, effectiveFrom, effectiveTo);
        synchronizeAliases(concept.id(), aliases);
        return diseaseView(concept, requireVisibleDiseaseSystem(tenantId, concept.codeSystemId()),
                aliasRepository.findByConceptIdOrderByAliasName(concept.id()));
    }

    @Transactional
    public DiseaseConceptView changeDiseaseStatus(Long tenantId, Long id, long expectedRevision,
                                                  TerminologyStatus status, Long replacementConceptId) {
        Concept concept = requireDisease(tenantId, id);
        requireRevision(concept, expectedRevision);
        if (replacementConceptId != null) requireDisease(tenantId, replacementConceptId);
        concept.changeStatus(status, replacementConceptId);
        return diseaseView(concept, requireVisibleDiseaseSystem(tenantId, concept.codeSystemId()),
                aliasRepository.findByConceptIdOrderByAliasName(concept.id()));
    }

    private List<CodeSystem> visibleDiseaseSystems(Long tenantId) {
        return codeSystemRepository.findAll().stream()
                .filter(system -> "DISEASE".equals(system.systemType()))
                .filter(system -> system.scopeType() == TerminologyScope.PRODUCT
                        || (system.scopeType() == TerminologyScope.TENANT && tenantId.equals(system.scopeId())))
                .toList();
    }

    private List<CodeSystem> visibleSystems(Long tenantId, String code, LocalDate atDate) {
        return codeSystemRepository.findAll().stream()
                .filter(system -> system.code().equals(code))
                .filter(system -> system.status() == TerminologyStatus.ACTIVE)
                .filter(system -> system.isEffectiveAt(atDate))
                .filter(system -> system.scopeType() == TerminologyScope.PRODUCT
                        || (system.scopeType() == TerminologyScope.TENANT && tenantId.equals(system.scopeId())))
                .sorted(Comparator.comparing((CodeSystem value) -> value.scopeType() == TerminologyScope.TENANT ? 0 : 1)
                        .thenComparing(CodeSystem::effectiveFrom, Comparator.reverseOrder()))
                .toList();
    }

    private CodeSystem requireVisibleDiseaseSystem(Long tenantId, Long id) {
        return visibleDiseaseSystems(tenantId).stream().filter(value -> value.id().equals(id)).findFirst()
                .orElseThrow(() -> notFound("DISEASE_CODE_SYSTEM_NOT_FOUND", "未找到可用的疾病编码体系"));
    }

    private Concept requireDisease(Long tenantId, Long id) {
        Concept concept = conceptRepository.findById(id)
                .orElseThrow(() -> notFound("DISEASE_NOT_FOUND", "未找到疾病概念"));
        requireVisibleDiseaseSystem(tenantId, concept.codeSystemId());
        return concept;
    }

    private void requireRevision(Concept concept, long expectedRevision) {
        if (concept.revision() != expectedRevision) {
            throw conflict("DISEASE_REVISION_STALE", "疾病资料已被其他用户修改，请刷新后重试");
        }
    }

    private Map<Long, List<ConceptAlias>> aliasesByConcept(Collection<Long> conceptIds) {
        if (conceptIds.isEmpty()) return Map.of();
        return aliasRepository.findByConceptIdIn(conceptIds).stream()
                .collect(Collectors.groupingBy(ConceptAlias::conceptId));
    }

    private boolean matches(Concept concept, List<ConceptAlias> aliases, String query) {
        return contains(concept.code(), query) || contains(concept.display(), query)
                || contains(concept.shortDisplay(), query) || contains(concept.searchCode(), query)
                || aliases.stream().anyMatch(alias -> alias.status() == TerminologyStatus.ACTIVE
                        && (contains(alias.aliasName(), query) || contains(alias.searchCode(), query)));
    }

    private boolean contains(String value, String query) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(query);
    }

    private void saveNewAliases(Long conceptId, Collection<String> values) {
        normalizedAliases(values).forEach(value -> aliasRepository.save(
                new ConceptAlias(conceptId, "SYNONYM", value, null)));
    }

    private void synchronizeAliases(Long conceptId, Collection<String> values) {
        Set<String> requested = Set.copyOf(normalizedAliases(values));
        List<ConceptAlias> current = aliasRepository.findByConceptIdOrderByAliasName(conceptId);
        current.stream().filter(value -> value.status() == TerminologyStatus.ACTIVE)
                .filter(value -> !requested.contains(value.aliasName())).forEach(ConceptAlias::retire);
        Map<String, ConceptAlias> existing = current.stream()
                .collect(Collectors.toMap(ConceptAlias::aliasName, Function.identity(), (left, right) -> left));
        requested.forEach(value -> {
            ConceptAlias alias = existing.get(value);
            if (alias == null) aliasRepository.save(new ConceptAlias(conceptId, "SYNONYM", value, null));
            else alias.activate();
        });
    }

    private List<String> normalizedAliases(Collection<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(java.util.Objects::nonNull).map(String::trim)
                .filter(value -> !value.isBlank()).distinct().limit(30).toList();
    }

    private DiseaseConceptView diseaseView(Concept concept, CodeSystem system, List<ConceptAlias> aliases) {
        return new DiseaseConceptView(concept.id(), concept.revision(), concept.codeSystemId(), system.code(),
                system.name(), system.versionCode(), concept.code(), concept.display(), concept.shortDisplay(),
                concept.conceptType(), concept.chapterCode(), concept.chapterName(), concept.definition(),
                concept.searchCode(), concept.status().name(), concept.effectiveFrom(), concept.effectiveTo(),
                concept.replacementConceptId(), aliases.stream()
                        .filter(value -> value.status() == TerminologyStatus.ACTIVE)
                        .map(value -> new ConceptAliasView(value.id(), value.aliasType(), value.aliasName(),
                                value.searchCode())).toList());
    }

    private ValueSet findValueSet(Long tenantId, String code, LocalDate atDate) {
        List<ValueSet> tenantSets = valueSetRepository
                .findByScopeTypeAndScopeIdAndCodeAndStatusAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                        TerminologyScope.TENANT, tenantId, code, TerminologyStatus.ACTIVE, atDate);
        return tenantSets.stream().filter(valueSet -> valueSet.isEffectiveAt(atDate)).findFirst()
                .orElseGet(() -> valueSetRepository
                        .findByScopeTypeAndScopeIdAndCodeAndStatusAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                                TerminologyScope.PRODUCT, PRODUCT_SCOPE_ID, code, TerminologyStatus.ACTIVE, atDate)
                        .stream().filter(valueSet -> valueSet.isEffectiveAt(atDate)).findFirst()
                        .orElseThrow(() -> notFound("VALUE_SET_NOT_FOUND", "未找到有效值域 " + code)));
    }

    private BusinessException notFound(String code, String message) {
        return new BusinessException(code, message, HttpStatus.NOT_FOUND);
    }

    private BusinessException conflict(String code, String message) {
        return new BusinessException(code, message, HttpStatus.CONFLICT);
    }
}
