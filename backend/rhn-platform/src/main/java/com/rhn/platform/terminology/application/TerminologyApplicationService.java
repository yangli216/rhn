package com.rhn.platform.terminology.application;

import com.rhn.platform.terminology.api.CodeSystemSummary;
import com.rhn.platform.terminology.api.CodeSystemSnapshot;
import com.rhn.platform.terminology.api.ConceptSnapshot;
import com.rhn.platform.terminology.api.ConceptAliasView;
import com.rhn.platform.terminology.api.ConceptView;
import com.rhn.platform.terminology.api.DiseaseConceptView;
import com.rhn.platform.terminology.api.DiseaseManagementProgramView;
import com.rhn.platform.terminology.api.DiseaseSearchPage;
import com.rhn.platform.terminology.api.DiseaseManagementTagView;
import com.rhn.platform.terminology.api.DiseaseReferenceSnapshot;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.platform.terminology.api.TerminologyConceptSnapshot;
import com.rhn.platform.terminology.domain.CodeSystem;
import com.rhn.platform.terminology.domain.Concept;
import com.rhn.platform.terminology.domain.ConceptAlias;
import com.rhn.platform.terminology.domain.DiseaseManagementMember;
import com.rhn.platform.terminology.domain.DiseaseManagementProgram;
import com.rhn.platform.terminology.domain.DiseaseManagementRule;
import com.rhn.platform.terminology.domain.TerminologyScope;
import com.rhn.platform.terminology.domain.TerminologyStatus;
import com.rhn.platform.terminology.domain.TerminologyCodePolicy;
import com.rhn.platform.terminology.domain.ValueSet;
import com.rhn.platform.terminology.domain.ValueSetMember;
import com.rhn.platform.terminology.infrastructure.CodeSystemRepository;
import com.rhn.platform.terminology.infrastructure.ConceptRepository;
import com.rhn.platform.terminology.infrastructure.ConceptAliasRepository;
import com.rhn.platform.terminology.infrastructure.DiseaseManagementMemberRepository;
import com.rhn.platform.terminology.infrastructure.DiseaseManagementProgramRepository;
import com.rhn.platform.terminology.infrastructure.DiseaseManagementRuleRepository;
import com.rhn.platform.terminology.infrastructure.ValueSetMemberRepository;
import com.rhn.platform.terminology.infrastructure.ValueSetRepository;
import com.rhn.platform.search.api.MasterDataSearchDirectory;
import com.rhn.platform.search.application.SearchEntryProjectionService;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.api.PageResult;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
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
    private final DiseaseManagementProgramRepository managementProgramRepository;
    private final DiseaseManagementMemberRepository managementMemberRepository;
    private final DiseaseManagementRuleRepository managementRuleRepository;
    private final MasterDataSearchDirectory searchDirectory;
    private final SearchEntryProjectionService searchProjections;

    public TerminologyApplicationService(CodeSystemRepository codeSystemRepository,
                                         ConceptRepository conceptRepository,
                                         ConceptAliasRepository aliasRepository,
                                         ValueSetRepository valueSetRepository,
                                         ValueSetMemberRepository memberRepository,
                                         DiseaseManagementProgramRepository managementProgramRepository,
                                         DiseaseManagementMemberRepository managementMemberRepository,
                                         DiseaseManagementRuleRepository managementRuleRepository,
                                         MasterDataSearchDirectory searchDirectory,
                                         SearchEntryProjectionService searchProjections) {
        this.codeSystemRepository = codeSystemRepository;
        this.conceptRepository = conceptRepository;
        this.aliasRepository = aliasRepository;
        this.valueSetRepository = valueSetRepository;
        this.memberRepository = memberRepository;
        this.managementProgramRepository = managementProgramRepository;
        this.managementMemberRepository = managementMemberRepository;
        this.managementRuleRepository = managementRuleRepository;
        this.searchDirectory = searchDirectory;
        this.searchProjections = searchProjections;
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
        return createCodeSystem(tenantId, productScope, code, name, canonicalUri, version, systemType, null,
                publisher, description, authorityType, sourceUri, contentHash, effectiveFrom, effectiveTo);
    }

    @Transactional
    public Long createCodeSystem(Long tenantId, boolean productScope, String code, String name, String canonicalUri,
                                 String version, String systemType, String diagnosisDomain, String publisher,
                                 String description, String authorityType, String sourceUri, String contentHash,
                                 LocalDate effectiveFrom, LocalDate effectiveTo) {
        if (!Set.of("NATIONAL", "INSURANCE", "REGULATORY", "LOCAL", "INTERNAL", "OTHER")
                .contains(authorityType == null ? "INTERNAL" : authorityType)) {
            throw badRequest("CODE_SYSTEM_AUTHORITY_INVALID", "标准发布权威类型不正确");
        }
        CodeSystem system = new CodeSystem(productScope ? TerminologyScope.PRODUCT : TerminologyScope.TENANT,
                productScope ? PRODUCT_SCOPE_ID : tenantId, code, name, canonicalUri, version,
                systemType, diagnosisDomain, publisher, description, authorityType, sourceUri, contentHash,
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
        searchProjections.synchronizeConcept(concept, system, List.of(), null);
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
        Concept concept = conceptRepository.findById(conceptId)
                .orElseThrow(() -> notFound("CONCEPT_NOT_FOUND", "未找到术语概念"));
        concept.activate();
        CodeSystem system = codeSystemRepository.findById(concept.codeSystemId())
                .orElseThrow(() -> notFound("CODE_SYSTEM_NOT_FOUND", "未找到编码体系"));
        searchProjections.synchronizeConcept(concept, system,
                aliasRepository.findByConceptIdOrderByAliasName(concept.id()), null);
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
    public Optional<ConceptView> findValueSetMember(Long tenantId, String valueSetCode, String codeDisplayOrAlias,
                                                    LocalDate atDate) {
        String candidate = clean(codeDisplayOrAlias);
        if (candidate == null) return Optional.empty();
        List<ConceptView> concepts = expandValueSet(tenantId, valueSetCode, atDate);
        Optional<ConceptView> direct = concepts.stream()
                .filter(value -> value.code().equalsIgnoreCase(candidate) || value.display().equalsIgnoreCase(candidate))
                .findFirst();
        if (direct.isPresent()) return direct;
        Map<Long, ConceptView> byId = concepts.stream().collect(Collectors.toMap(ConceptView::id, Function.identity()));
        return aliasRepository.findByConceptIdIn(byId.keySet()).stream()
                .filter(alias -> alias.status() == TerminologyStatus.ACTIVE)
                .filter(alias -> alias.aliasName().equalsIgnoreCase(candidate))
                .map(alias -> byId.get(alias.conceptId()))
                .filter(Objects::nonNull)
                .findFirst();
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

    @Override
    @Transactional(readOnly = true)
    public Optional<TerminologyConceptSnapshot> findConcept(Long tenantId, String codeSystemCode, String conceptCode,
                                                            LocalDate atDate) {
        return visibleSystems(tenantId, codeSystemCode, atDate).stream().findFirst().flatMap(system ->
                conceptRepository.findByCodeSystemIdAndCode(system.id(), conceptCode)
                        .filter(Concept::isActive)
                        .filter(value -> value.isEffectiveAt(atDate))
                        .map(concept -> new TerminologyConceptSnapshot(concept.id(), system.code(),
                                system.canonicalUri(), system.versionCode(), concept.code(), concept.display())));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TerminologyConceptSnapshot> findDiseaseByExactName(Long tenantId, String codeSystemCode,
                                                                      String name, LocalDate atDate) {
        if (name == null || name.isBlank()) return Optional.empty();
        String normalized = name.trim();
        var systemIds = visibleDiseaseSystems(tenantId).stream()
                .filter(system -> codeSystemCode.equals(system.code())).map(CodeSystem::id).toList();
        if (systemIds.isEmpty()) return Optional.empty();
        var matches = conceptRepository.findExactDiseaseNames(systemIds, normalized, TerminologyStatus.ACTIVE, atDate).stream()
                .map(value -> findConcept(tenantId, codeSystemCode, value.code(), atDate))
                .flatMap(Optional::stream).distinct().toList();
        return matches.size() == 1 ? Optional.of(matches.getFirst()) : Optional.empty();
    }

    @Override
    @Transactional(readOnly = true)
    public List<CodeSystemSnapshot> listCodeSystems() {
        return codeSystemRepository.findAll().stream().map(this::snapshot).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<CodeSystemSnapshot> findCodeSystems(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        return codeSystemRepository.findAllById(ids).stream().map(this::snapshot).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<CodeSystemSnapshot> findCodeSystem(Long id) {
        return codeSystemRepository.findById(id).map(this::snapshot);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ConceptSnapshot> listConcepts(Long codeSystemId) {
        return conceptRepository.findByCodeSystemIdInOrderByDisplay(List.of(codeSystemId)).stream()
                .map(this::snapshot).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ConceptSnapshot> findConcepts(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        return conceptRepository.findAllById(ids).stream().map(this::snapshot).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ConceptSnapshot> findConcept(Long id) {
        return conceptRepository.findById(id).map(this::snapshot);
    }

    private CodeSystemSnapshot snapshot(CodeSystem value) {
        return new CodeSystemSnapshot(value.id(), value.scopeType().name(), value.scopeId(), value.code(),
                value.name(), value.canonicalUri(), value.versionCode(), value.systemType(), value.publisher(),
                value.authorityType(), value.sourceUri(), value.contentHash(), value.status().name(),
                value.effectiveFrom(), value.effectiveTo());
    }

    private ConceptSnapshot snapshot(Concept value) {
        return new ConceptSnapshot(value.id(), value.codeSystemId(), value.code(), value.display(),
                value.shortDisplay(), value.conceptType(), value.searchCode(), value.status().name(),
                value.effectiveFrom(), value.effectiveTo());
    }

    @Transactional(readOnly = true)
    public List<CodeSystemSummary> listDiseaseCodeSystems(Long tenantId) {
        return visibleDiseaseSystems(tenantId).stream()
                .map(system -> new CodeSystemSummary(system.id(), system.revision(), system.code(), system.name(),
                        system.versionCode(), system.diagnosisDomain(), system.status().name(), system.effectiveFrom(), system.effectiveTo(),
                        system.publisher()))
                .sorted(Comparator.comparing(CodeSystemSummary::name))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DiseaseConceptView> listDiseases(Long tenantId, String query, String conceptType,
                                                 TerminologyStatus status) {
        return searchDiseases(tenantId, query, conceptType, status, null, 0, 500).content();
    }

    @Transactional(readOnly = true)
    public DiseaseSearchPage searchDiseases(Long tenantId, String query, String conceptType,
                                             TerminologyStatus status, String diagnosisDomain,
                                             int page, int size) {
        List<CodeSystem> systems = visibleDiseaseSystems(tenantId).stream()
                .filter(system -> diagnosisDomain == null || diagnosisDomain.isBlank()
                        || diagnosisDomain.equals(system.diagnosisDomain())).toList();
        int normalizedPage = Math.max(0, page);
        int normalizedSize = Math.max(10, Math.min(size, 100));
        if (systems.isEmpty()) return new DiseaseSearchPage(List.of(), 0, 0, normalizedPage, normalizedSize);
        Map<Long, CodeSystem> systemById = systems.stream()
                .collect(Collectors.toMap(CodeSystem::id, Function.identity()));
        String normalizedQuery = query == null ? "" : query.trim();
        Collection<Long> searchIds = normalizedQuery.isBlank() ? List.of(-1L)
                : searchDirectory.findMatchingTargetIds("CONCEPT", tenantId, null, null, normalizedQuery);
        if (searchIds.isEmpty()) searchIds = List.of(-1L);
        Page<Concept> result = conceptRepository.searchDiseases(systemById.keySet(),
                normalizedQuery, searchIds, conceptType == null ? "" : conceptType.trim(), status,
                PageRequest.of(normalizedPage, normalizedSize, Sort.by("display").ascending().and(Sort.by("code"))));
        List<Concept> concepts = result.getContent();
        Map<Long, List<ConceptAlias>> aliases = aliasesByConcept(concepts.stream().map(Concept::id).toList());
        Map<Long, List<DiseaseManagementProgram>> programs = programsByConcept(
                tenantId, concepts.stream().map(Concept::id).toList(), LocalDate.now(), false);
        List<DiseaseConceptView> content = concepts.stream()
                .map(value -> diseaseView(value, systemById.get(value.codeSystemId()),
                        aliases.getOrDefault(value.id(), List.of()), programs.getOrDefault(value.id(), List.of())))
                .toList();
        return new DiseaseSearchPage(content, result.getTotalElements(), result.getTotalPages(), normalizedPage,
                normalizedSize);
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
        List<ConceptAlias> savedAliases = aliasRepository.findByConceptIdOrderByAliasName(concept.id());
        searchProjections.synchronizeConcept(concept, system, savedAliases, null);
        return diseaseView(concept, system, savedAliases, List.of());
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
        CodeSystem system = requireVisibleDiseaseSystem(tenantId, concept.codeSystemId());
        List<ConceptAlias> savedAliases = aliasRepository.findByConceptIdOrderByAliasName(concept.id());
        searchProjections.synchronizeConcept(concept, system, savedAliases, null);
        return diseaseView(concept, system, savedAliases,
                programsForConcept(tenantId, concept.id(), LocalDate.now(), false));
    }

    @Transactional
    public DiseaseConceptView changeDiseaseStatus(Long tenantId, Long id, long expectedRevision,
                                                  TerminologyStatus status, Long replacementConceptId) {
        Concept concept = requireDisease(tenantId, id);
        requireRevision(concept, expectedRevision);
        if (replacementConceptId != null) requireDisease(tenantId, replacementConceptId);
        concept.changeStatus(status, replacementConceptId);
        CodeSystem system = requireVisibleDiseaseSystem(tenantId, concept.codeSystemId());
        List<ConceptAlias> aliases = aliasRepository.findByConceptIdOrderByAliasName(concept.id());
        searchProjections.synchronizeConcept(concept, system, aliases, null);
        return diseaseView(concept, system, aliases,
                programsForConcept(tenantId, concept.id(), LocalDate.now(), false));
    }

    @Override
    @Transactional(readOnly = true)
    public DiseaseReferenceSnapshot requireDisease(Long tenantId, Long conceptId, LocalDate atDate) {
        Concept concept = requireDisease(tenantId, conceptId);
        CodeSystem system = requireVisibleDiseaseSystem(tenantId, concept.codeSystemId());
        if (!concept.isActive() || !concept.isEffectiveAt(atDate) || system.status() != TerminologyStatus.ACTIVE
                || !system.isEffectiveAt(atDate)) {
            throw badRequest("DISEASE_NOT_EFFECTIVE", "所选疾病在当前业务日期不可用");
        }
        List<DiseaseReferenceSnapshot.DiseaseManagementSnapshot> programs = programsForConcept(
                tenantId, concept.id(), atDate, true).stream().map(value ->
                new DiseaseReferenceSnapshot.DiseaseManagementSnapshot(value.id(), value.code(), value.name(),
                        value.managementType(), value.triggerAction(), value.reportCardType(),
                        value.reportDeadlineHours())).toList();
        return new DiseaseReferenceSnapshot(concept.id(), system.code(), system.canonicalUri(), system.versionCode(),
                system.diagnosisDomain(), concept.code(), concept.display(), programs);
    }

    @Transactional(readOnly = true)
    public List<DiseaseManagementProgramView> listDiseaseManagementPrograms(Long tenantId, TerminologyStatus status) {
        List<DiseaseManagementProgram> programs = visibleManagementPrograms(tenantId).stream()
                .filter(value -> status == null || value.status() == status).toList();
        Map<Long, List<DiseaseManagementMember>> members = managementMemberRepository
                .findByProgramIdIn(programs.stream().map(DiseaseManagementProgram::id).toList()).stream()
                .collect(Collectors.groupingBy(DiseaseManagementMember::programId));
        Map<Long, List<DiseaseManagementRule>> rules = managementRuleRepository
                .findByProgramIdIn(programs.stream().map(DiseaseManagementProgram::id).toList()).stream()
                .collect(Collectors.groupingBy(DiseaseManagementRule::programId));
        Set<Long> conceptIds = members.values().stream().flatMap(Collection::stream)
                .map(DiseaseManagementMember::conceptId).collect(Collectors.toSet());
        Map<Long, Concept> concepts = conceptRepository.findAllById(conceptIds).stream()
                .collect(Collectors.toMap(Concept::id, Function.identity()));
        Set<Long> systemIds = concepts.values().stream().map(Concept::codeSystemId).collect(Collectors.toSet());
        rules.values().stream().flatMap(Collection::stream).map(DiseaseManagementRule::codeSystemId)
                .filter(java.util.Objects::nonNull).forEach(systemIds::add);
        Map<Long, CodeSystem> systems = codeSystemRepository.findAllById(systemIds).stream()
                .collect(Collectors.toMap(CodeSystem::id, Function.identity()));
        return programs.stream().map(value -> programView(value, rules.getOrDefault(value.id(), List.of()),
                members.getOrDefault(value.id(), List.of()), concepts, systems)).toList();
    }

    @Transactional(readOnly = true)
    public PageResult<DiseaseManagementProgramView> searchDiseaseManagementPrograms(Long tenantId, String query,
            String managementType, TerminologyStatus status, int page, int size) {
        int normalizedPage = Math.max(page, 0);
        int normalizedSize = Math.max(10, Math.min(size, 100));
        Page<DiseaseManagementProgram> result = managementProgramRepository.searchVisible(tenantId, query,
                managementType, status, PageRequest.of(normalizedPage, normalizedSize,
                        Sort.by("name").ascending().and(Sort.by("id").ascending())));
        List<DiseaseManagementProgram> programs = result.getContent();
        Map<Long, List<DiseaseManagementMember>> members = managementMemberRepository
                .findByProgramIdIn(programs.stream().map(DiseaseManagementProgram::id).toList()).stream()
                .collect(Collectors.groupingBy(DiseaseManagementMember::programId));
        Map<Long, List<DiseaseManagementRule>> rules = managementRuleRepository
                .findByProgramIdIn(programs.stream().map(DiseaseManagementProgram::id).toList()).stream()
                .collect(Collectors.groupingBy(DiseaseManagementRule::programId));
        Set<Long> conceptIds = members.values().stream().flatMap(Collection::stream)
                .map(DiseaseManagementMember::conceptId).collect(Collectors.toSet());
        Map<Long, Concept> concepts = conceptRepository.findAllById(conceptIds).stream()
                .collect(Collectors.toMap(Concept::id, Function.identity()));
        Set<Long> systemIds = concepts.values().stream().map(Concept::codeSystemId).collect(Collectors.toSet());
        rules.values().stream().flatMap(Collection::stream).map(DiseaseManagementRule::codeSystemId)
                .filter(Objects::nonNull).forEach(systemIds::add);
        Map<Long, CodeSystem> systems = codeSystemRepository.findAllById(systemIds).stream()
                .collect(Collectors.toMap(CodeSystem::id, Function.identity()));
        List<DiseaseManagementProgramView> content = programs.stream()
                .map(value -> programView(value, rules.getOrDefault(value.id(), List.of()),
                        members.getOrDefault(value.id(), List.of()), concepts, systems)).toList();
        return new PageResult<>(content, result.getTotalElements(), result.getTotalPages(),
                result.getNumber(), result.getSize());
    }

    @Transactional
    public DiseaseManagementProgramView createDiseaseManagementProgram(Long tenantId, boolean productScope,
            String code, String name, String managementType, String triggerAction, String description,
            String reportCardType, Integer reportDeadlineHours, LocalDate effectiveFrom, LocalDate effectiveTo) {
        TerminologyScope scope = productScope ? TerminologyScope.PRODUCT : TerminologyScope.TENANT;
        Long scopeId = productScope ? PRODUCT_SCOPE_ID : tenantId;
        if (managementProgramRepository.existsByScopeTypeAndScopeIdAndCode(scope, scopeId, code)) {
            throw conflict("DISEASE_PROGRAM_CODE_DUPLICATE", "当前作用域已存在相同的疾病管理项目编码");
        }
        DiseaseManagementProgram value = managementProgramRepository.save(new DiseaseManagementProgram(scope,
                scopeId, code, name, managementType, triggerAction, description, reportCardType,
                reportDeadlineHours, effectiveFrom, effectiveTo));
        return programView(value, List.of(), List.of(), Map.of(), Map.of());
    }

    @Transactional
    public DiseaseManagementProgramView updateDiseaseManagementProgram(Long tenantId, Long id,
            long expectedRevision, String name, String managementType, String triggerAction, String description,
            String reportCardType, Integer reportDeadlineHours, LocalDate effectiveFrom, LocalDate effectiveTo) {
        DiseaseManagementProgram value = requireManagementProgram(tenantId, id);
        value.update(expectedRevision, name, managementType, triggerAction, description, reportCardType,
                reportDeadlineHours, effectiveFrom, effectiveTo);
        return programWithMembers(value);
    }

    @Transactional
    public DiseaseManagementProgramView replaceDiseaseManagementMembers(Long tenantId, Long id,
                                                                          long expectedRevision,
                                                                          Collection<Long> conceptIds) {
        DiseaseManagementProgram value = requireManagementProgram(tenantId, id);
        value.replaceMembers(expectedRevision);
        List<Long> normalized = conceptIds == null ? List.of() : conceptIds.stream().distinct().limit(1000).toList();
        normalized.forEach(conceptId -> requireDisease(tenantId, conceptId));
        managementMemberRepository.deleteByProgramId(id);
        managementMemberRepository.flush();
        normalized.forEach(conceptId -> managementMemberRepository.save(new DiseaseManagementMember(
                id, conceptId, value.effectiveFrom(), value.effectiveTo(), null)));
        managementProgramRepository.flush();
        return programWithMembers(value);
    }

    @Transactional
    public DiseaseManagementProgramView replaceDiseaseManagementScope(Long tenantId, Long id,
            long expectedRevision, Collection<DiseaseRuleCommand> rules,
            Collection<DiseaseExceptionCommand> exceptions) {
        DiseaseManagementProgram value = requireManagementProgram(tenantId, id);
        value.replaceMembers(expectedRevision);
        List<DiseaseRuleCommand> normalizedRules = rules == null ? List.of() : rules.stream().limit(100).toList();
        List<DiseaseExceptionCommand> normalizedExceptions = exceptions == null ? List.of()
                : exceptions.stream().filter(java.util.Objects::nonNull)
                .collect(Collectors.toMap(DiseaseExceptionCommand::conceptId, Function.identity(),
                        (left, right) -> right)).values().stream().limit(1000).toList();
        normalizedRules.forEach(rule -> {
            if (rule.codeSystemId() != null) requireVisibleDiseaseSystem(tenantId, rule.codeSystemId());
        });
        normalizedExceptions.forEach(exception -> requireDisease(tenantId, exception.conceptId()));
        managementRuleRepository.deleteByProgramId(id);
        managementMemberRepository.deleteByProgramId(id);
        managementRuleRepository.flush();
        managementMemberRepository.flush();
        normalizedRules.forEach(rule -> managementRuleRepository.save(new DiseaseManagementRule(id,
                rule.inclusionMode(), clean(rule.diagnosisDomain()), rule.codeSystemId(), clean(rule.conceptType()),
                clean(rule.chapterCode()), clean(rule.codeFrom()), clean(rule.codeTo()), clean(rule.note()))));
        normalizedExceptions.forEach(exception -> managementMemberRepository.save(new DiseaseManagementMember(
                id, exception.conceptId(), exception.inclusionMode(), value.effectiveFrom(), value.effectiveTo(),
                clean(exception.note()))));
        managementProgramRepository.flush();
        return programWithMembers(value);
    }

    public record DiseaseRuleCommand(String inclusionMode, String diagnosisDomain, Long codeSystemId,
                                     String conceptType, String chapterCode, String codeFrom, String codeTo,
                                     String note) {}

    public record DiseaseExceptionCommand(Long conceptId, String inclusionMode, String note) {}

    @Transactional
    public DiseaseManagementProgramView changeDiseaseManagementProgramStatus(Long tenantId, Long id,
                                                                               long expectedRevision,
                                                                               TerminologyStatus status) {
        DiseaseManagementProgram value = requireManagementProgram(tenantId, id);
        value.changeStatus(expectedRevision, status);
        return programWithMembers(value);
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

    private DiseaseConceptView diseaseView(Concept concept, CodeSystem system, List<ConceptAlias> aliases,
                                           List<DiseaseManagementProgram> programs) {
        return new DiseaseConceptView(concept.id(), concept.revision(), concept.codeSystemId(), system.code(),
                system.name(), system.versionCode(), system.diagnosisDomain(), concept.code(), concept.display(), concept.shortDisplay(),
                concept.conceptType(), concept.chapterCode(), concept.chapterName(), concept.definition(),
                concept.searchCode(), concept.status().name(), concept.effectiveFrom(), concept.effectiveTo(),
                concept.replacementConceptId(), aliases.stream()
                        .filter(value -> value.status() == TerminologyStatus.ACTIVE)
                        .map(value -> new ConceptAliasView(value.id(), value.aliasType(), value.aliasName(),
                                value.searchCode())).toList(), programs.stream().map(this::managementTag).toList());
    }

    private DiseaseManagementTagView managementTag(DiseaseManagementProgram value) {
        return new DiseaseManagementTagView(value.id(), value.code(), value.name(), value.managementType(),
                value.triggerAction(), value.reportCardType(), value.reportDeadlineHours());
    }

    private List<DiseaseManagementProgram> visibleManagementPrograms(Long tenantId) {
        return managementProgramRepository.findAllByOrderByName().stream()
                .filter(value -> value.scopeType() == TerminologyScope.PRODUCT
                        || (value.scopeType() == TerminologyScope.TENANT && tenantId.equals(value.scopeId())))
                .sorted(Comparator.comparing((DiseaseManagementProgram value) ->
                        value.scopeType() == TerminologyScope.TENANT ? 0 : 1).thenComparing(DiseaseManagementProgram::name))
                .toList();
    }

    private Map<Long, List<DiseaseManagementProgram>> programsByConcept(Long tenantId, Collection<Long> conceptIds,
                                                                         LocalDate atDate, boolean activeOnly) {
        if (conceptIds.isEmpty()) return Map.of();
        Map<Long, DiseaseManagementProgram> programs = visibleManagementPrograms(tenantId).stream()
                .filter(value -> !activeOnly || (value.status() == TerminologyStatus.ACTIVE && value.isEffectiveAt(atDate)))
                .collect(Collectors.toMap(DiseaseManagementProgram::id, Function.identity()));
        if (programs.isEmpty()) return Map.of();
        Map<Long, List<DiseaseManagementRule>> rules = managementRuleRepository
                .findByProgramIdIn(programs.keySet()).stream()
                .collect(Collectors.groupingBy(DiseaseManagementRule::programId));
        Map<Long, Map<Long, DiseaseManagementMember>> exceptions = managementMemberRepository
                .findByConceptIdIn(conceptIds).stream()
                .filter(value -> !activeOnly || value.isEffectiveAt(atDate))
                .filter(value -> programs.containsKey(value.programId()))
                .collect(Collectors.groupingBy(DiseaseManagementMember::conceptId,
                        Collectors.toMap(DiseaseManagementMember::programId, Function.identity())));
        Map<Long, Concept> concepts = conceptRepository.findAllById(conceptIds).stream()
                .collect(Collectors.toMap(Concept::id, Function.identity()));
        Map<Long, CodeSystem> systems = codeSystemRepository.findAllById(concepts.values().stream()
                .map(Concept::codeSystemId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(CodeSystem::id, Function.identity()));
        return concepts.values().stream().collect(Collectors.toMap(Concept::id, concept -> programs.values().stream()
                .filter(program -> appliesToConcept(program.id(), concept, systems.get(concept.codeSystemId()),
                        rules.getOrDefault(program.id(), List.of()),
                        exceptions.getOrDefault(concept.id(), Map.of()).get(program.id())))
                .sorted(Comparator.comparing(DiseaseManagementProgram::name)).toList()));
    }

    private boolean appliesToConcept(Long programId, Concept concept, CodeSystem system,
                                     List<DiseaseManagementRule> rules,
                                     DiseaseManagementMember exception) {
        if (exception != null) return "INCLUDE".equals(exception.inclusionMode());
        boolean included = rules.stream().filter(rule -> "INCLUDE".equals(rule.inclusionMode()))
                .anyMatch(rule -> rule.matches(concept, system));
        if (!included) return false;
        return rules.stream().filter(rule -> "EXCLUDE".equals(rule.inclusionMode()))
                .noneMatch(rule -> rule.matches(concept, system));
    }

    private List<DiseaseManagementProgram> programsForConcept(Long tenantId, Long conceptId, LocalDate atDate,
                                                               boolean activeOnly) {
        return programsByConcept(tenantId, List.of(conceptId), atDate, activeOnly)
                .getOrDefault(conceptId, List.of());
    }

    private DiseaseManagementProgram requireManagementProgram(Long tenantId, Long id) {
        DiseaseManagementProgram value = managementProgramRepository.findById(id)
                .orElseThrow(() -> notFound("DISEASE_PROGRAM_NOT_FOUND", "未找到疾病管理项目"));
        if (value.scopeType() == TerminologyScope.TENANT && !tenantId.equals(value.scopeId())) {
            throw notFound("DISEASE_PROGRAM_NOT_FOUND", "未找到疾病管理项目");
        }
        return value;
    }

    private DiseaseManagementProgramView programWithMembers(DiseaseManagementProgram value) {
        List<DiseaseManagementMember> members = managementMemberRepository.findByProgramIdOrderByCreatedAt(value.id());
        List<DiseaseManagementRule> rules = managementRuleRepository.findByProgramIdOrderByCreatedAt(value.id());
        Map<Long, Concept> concepts = conceptRepository.findAllById(
                members.stream().map(DiseaseManagementMember::conceptId).toList()).stream()
                .collect(Collectors.toMap(Concept::id, Function.identity()));
        Map<Long, CodeSystem> systems = codeSystemRepository.findAllById(concepts.values().stream()
                .map(Concept::codeSystemId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(CodeSystem::id, Function.identity()));
        rules.stream().map(DiseaseManagementRule::codeSystemId).filter(java.util.Objects::nonNull)
                .filter(id -> !systems.containsKey(id)).forEach(id -> codeSystemRepository.findById(id)
                        .ifPresent(system -> systems.put(id, system)));
        return programView(value, rules, members, concepts, systems);
    }

    private DiseaseManagementProgramView programView(DiseaseManagementProgram value,
            List<DiseaseManagementRule> rules, List<DiseaseManagementMember> members,
            Map<Long, Concept> concepts, Map<Long, CodeSystem> systems) {
        return new DiseaseManagementProgramView(value.id(), value.revision(), value.scopeType().name(), value.scopeId(),
                value.code(), value.name(), value.managementType(), value.triggerAction(), value.description(),
                value.reportCardType(), value.reportDeadlineHours(), value.status().name(), value.effectiveFrom(),
                value.effectiveTo(), rules.size(), members.size(), rules.stream().map(rule -> {
                    CodeSystem system = rule.codeSystemId() == null ? null : systems.get(rule.codeSystemId());
                    return new DiseaseManagementProgramView.RuleView(rule.id(), rule.inclusionMode(),
                            rule.diagnosisDomain(), rule.codeSystemId(), system == null ? null : system.code(),
                            system == null ? null : system.name(), rule.conceptType(), rule.chapterCode(),
                            rule.codeFrom(), rule.codeTo(), rule.note());
                }).toList(), members.stream().map(member -> {
                    Concept concept = concepts.get(member.conceptId());
                    CodeSystem system = concept == null ? null : systems.get(concept.codeSystemId());
                    return new DiseaseManagementProgramView.MemberView(member.conceptId(), member.inclusionMode(),
                            concept == null ? "" : concept.code(), concept == null ? "已删除概念" : concept.display(),
                            system == null ? "未知编码体系" : system.name(),
                            system == null ? "WESTERN_MEDICINE" : system.diagnosisDomain());
                }).toList());
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
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
