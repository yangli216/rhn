package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.platform.masterdata.api.StandardMappingViews.ItemTermMappingMaintenanceView;
import com.rhn.platform.masterdata.api.StandardMappingViews.ItemTermMappingView;
import com.rhn.platform.masterdata.api.StandardMappingViews.StandardCodeSystemView;
import com.rhn.platform.masterdata.api.StandardMappingViews.StandardTermView;
import com.rhn.platform.masterdata.domain.ItemAttributeSubject;
import com.rhn.platform.masterdata.domain.ItemTermMapping;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeSubjectRepository;
import com.rhn.platform.masterdata.infrastructure.ItemTermMappingRepository;
import com.rhn.platform.terminology.api.CodeSystemSnapshot;
import com.rhn.platform.terminology.api.ConceptSnapshot;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ItemStandardMappingService implements ItemStandardMappingDirectory {
    private static final Set<String> SUBJECT_TYPES = Set.of("CATALOG_ITEM", "MEDICATION");
    private static final Set<String> MAPPING_TYPES = Set.of("CLINICAL", "INSURANCE", "REGULATORY", "LOCAL");
    private static final Set<String> EQUIVALENCES = Set.of("EXACT", "EQUIVALENT", "WIDER", "NARROWER", "RELATED");

    private final ItemAttributeSubjectRepository subjectRepository;
    private final ItemTermMappingRepository mappingRepository;
    private final TerminologyDirectory terminologyDirectory;
    private final ExecutionContextProvider contextProvider;

    public ItemStandardMappingService(ItemAttributeSubjectRepository subjectRepository,
                                      ItemTermMappingRepository mappingRepository,
                                      TerminologyDirectory terminologyDirectory,
                                      ExecutionContextProvider contextProvider) {
        this.subjectRepository = subjectRepository;
        this.mappingRepository = mappingRepository;
        this.terminologyDirectory = terminologyDirectory;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public List<StandardCodeSystemView> listCodeSystems(String query, String systemType, String authorityType,
                                                        LocalDate businessDate) {
        ExecutionContext context = current();
        String normalized = normalizeQuery(query);
        return terminologyDirectory.listCodeSystems().stream()
                .filter(value -> visible(context.tenantId(), value))
                .filter(value -> "ACTIVE".equals(value.status()))
                .filter(value -> blank(systemType) || systemType.equals(value.systemType()))
                .filter(value -> blank(authorityType) || authorityType.equals(value.authorityType()))
                .filter(value -> businessDate == null || value.isEffectiveAt(businessDate))
                .filter(value -> normalized.isBlank() || contains(value.code(), normalized)
                        || contains(value.name(), normalized) || contains(value.publisher(), normalized))
                .sorted(Comparator.comparing(CodeSystemSnapshot::authorityType).thenComparing(CodeSystemSnapshot::name)
                        .thenComparing(CodeSystemSnapshot::versionCode).reversed())
                .map(this::systemView)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<StandardTermView> listTerms(Long codeSystemId, String query, LocalDate businessDate) {
        ExecutionContext context = current();
        CodeSystemSnapshot system = requireVisibleSystem(context.tenantId(), codeSystemId);
        String normalized = normalizeQuery(query);
        return terminologyDirectory.listConcepts(codeSystemId).stream()
                .filter(value -> "ACTIVE".equals(value.status()))
                .filter(value -> businessDate == null || value.isEffectiveAt(businessDate))
                .filter(value -> normalized.isBlank() || contains(value.code(), normalized)
                        || contains(value.display(), normalized) || contains(value.shortDisplay(), normalized)
                        || contains(value.searchCode(), normalized))
                .sorted(Comparator.comparingInt((ConceptSnapshot value) -> scoreMatch(value, normalized))
                        .thenComparing(ConceptSnapshot::display, Comparator.nullsLast(String::compareTo))
                        .thenComparing(ConceptSnapshot::code))
                .limit(500)
                .map(value -> termView(value, system))
                .toList();
    }

    @Transactional(readOnly = true)
    public ItemTermMappingMaintenanceView maintenance(String subjectType, Long targetId, LocalDate businessDate) {
        ExecutionContext context = current();
        LocalDate at = businessDate == null ? LocalDate.now() : businessDate;
        ItemAttributeSubject subject = requireSubject(context.tenantId(), subjectType, targetId);
        List<ItemTermMappingView> history = views(context.tenantId(), subject,
                mappingRepository.findByTenantIdAndAttributeSubjectIdOrderByValidFromDescCreatedAtDesc(
                        context.tenantId(), subject.id()));
        return new ItemTermMappingMaintenanceView(subject.id(), subject.subjectType(), targetId, at,
                history.stream().filter(value -> effectiveAt(value, at)).toList(), history);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ItemTermMappingView> resolve(Long tenantId, String subjectType, Long targetId,
                                             String mappingType, LocalDate businessDate) {
        LocalDate at = businessDate == null ? LocalDate.now() : businessDate;
        ItemAttributeSubject subject = requireSubject(tenantId, subjectType, targetId);
        return views(tenantId, subject, mappingRepository
                .findByTenantIdAndAttributeSubjectIdOrderByValidFromDescCreatedAtDesc(tenantId, subject.id())).stream()
                .filter(value -> effectiveAt(value, at))
                .filter(value -> blank(mappingType) || mappingType.equals(value.mappingType()))
                .sorted(Comparator.comparing(ItemTermMappingView::primaryMapping).reversed()
                        .thenComparing(ItemTermMappingView::mappingType)
                        .thenComparing(ItemTermMappingView::systemName))
                .toList();
    }

    @Transactional
    public ItemTermMappingMaintenanceView create(String subjectType, Long targetId, Long conceptId,
                                                  String mappingType, String equivalence, boolean primaryMapping,
                                                  String limitation, LocalDate validFrom, LocalDate validTo,
                                                  Long replacesMappingId, Long expectedReplacesRevision) {
        ExecutionContext context = current();
        requireCommand(mappingType, equivalence, validFrom, validTo);
        ItemAttributeSubject subject = requireSubject(context.tenantId(), subjectType, targetId);
        ConceptSnapshot concept = terminologyDirectory.findConcept(conceptId)
                .orElseThrow(() -> notFound("STANDARD_TERM_NOT_FOUND", "未找到标准术语"));
        CodeSystemSnapshot system = requireVisibleSystem(context.tenantId(), concept.codeSystemId());
        if (!"ACTIVE".equals(concept.status()) || !"ACTIVE".equals(system.status())) {
            throw badRequest("ITEM_MAPPING_STANDARD_INACTIVE", "只能映射到已启用的编码发布版和标准术语");
        }
        requireEffectiveRange(system, concept, validFrom, validTo);
        requireAuthority(mappingType, system.authorityType());

        ItemTermMapping replaced = null;
        if (replacesMappingId != null) {
            replaced = mappingRepository.findByIdAndTenantId(replacesMappingId, context.tenantId())
                    .orElseThrow(() -> notFound("ITEM_MAPPING_NOT_FOUND", "未找到需要替代的标准映射"));
            if (!replaced.attributeSubjectId().equals(subject.id()) || !replaced.mappingType().equals(mappingType)) {
                throw badRequest("ITEM_MAPPING_REPLACEMENT_INVALID", "替代映射必须属于同一项目和映射用途");
            }
            if (expectedReplacesRevision == null) {
                throw badRequest("ITEM_MAPPING_REVISION_REQUIRED", "替代映射必须提交原映射修订号");
            }
        }

        List<ItemTermMapping> existing = mappingRepository
                .findByTenantIdAndAttributeSubjectIdOrderByValidFromDescCreatedAtDesc(context.tenantId(), subject.id());
        requireNoConflict(existing, replaced, system, conceptId, mappingType, primaryMapping, validFrom, validTo);
        if (replaced != null) replaced.supersede(expectedReplacesRevision, validFrom, actor(context));
        mappingRepository.save(new ItemTermMapping(context.tenantId(), subject.id(), conceptId, mappingType,
                equivalence, primaryMapping, clean(limitation), validFrom, validTo, replacesMappingId, actor(context)));
        return maintenance(subjectType, targetId, validFrom);
    }

    @Transactional
    public ItemTermMappingMaintenanceView changeStatus(Long mappingId, long expectedRevision, String status,
                                                        LocalDate validTo) {
        ExecutionContext context = current();
        ItemTermMapping mapping = mappingRepository.findByIdAndTenantId(mappingId, context.tenantId())
                .orElseThrow(() -> notFound("ITEM_MAPPING_NOT_FOUND", "未找到标准映射"));
        ItemAttributeSubject subject = subjectRepository.findById(mapping.attributeSubjectId())
                .filter(value -> context.tenantId().equals(value.tenantId()))
                .orElseThrow(() -> notFound("ITEM_MAPPING_SUBJECT_NOT_FOUND", "映射项目主体不存在"));
        mapping.changeStatus(expectedRevision, status, validTo, actor(context));
        return maintenance(subject.subjectType(), targetId(subject), LocalDate.now());
    }

    private void requireNoConflict(List<ItemTermMapping> mappings, ItemTermMapping replaced, CodeSystemSnapshot requestedSystem,
                                   Long conceptId, String mappingType, boolean primaryMapping,
                                   LocalDate validFrom, LocalDate validTo) {
        Map<Long, ConceptSnapshot> concepts = terminologyDirectory.findConcepts(mappings.stream()
                        .map(ItemTermMapping::conceptId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(ConceptSnapshot::id, Function.identity()));
        Map<Long, CodeSystemSnapshot> systems = terminologyDirectory.findCodeSystems(concepts.values().stream()
                        .map(ConceptSnapshot::codeSystemId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(CodeSystemSnapshot::id, Function.identity()));
        for (ItemTermMapping value : mappings) {
            if (replaced != null && value.id().equals(replaced.id())) continue;
            if (!value.mappingType().equals(mappingType)
                    || !value.overlaps(validFrom, validTo)) continue;
            if (value.conceptId().equals(conceptId)) {
                throw conflict("ITEM_MAPPING_PERIOD_OVERLAP", "同一标准术语在该有效期内已经建立映射");
            }
            ConceptSnapshot existingConcept = concepts.get(value.conceptId());
            CodeSystemSnapshot existingSystem = existingConcept == null ? null : systems.get(existingConcept.codeSystemId());
            if (primaryMapping && value.primaryMapping() && existingSystem != null
                    && existingSystem.code().equals(requestedSystem.code())) {
                throw conflict("ITEM_MAPPING_PRIMARY_OVERLAP", "同一标准体系和用途在该有效期内只能有一个主要映射");
            }
        }
    }

    private void requireEffectiveRange(CodeSystemSnapshot system, ConceptSnapshot concept, LocalDate from, LocalDate to) {
        LocalDate availableFrom = system.effectiveFrom().isAfter(concept.effectiveFrom())
                ? system.effectiveFrom() : concept.effectiveFrom();
        LocalDate availableTo = earliest(system.effectiveTo(), concept.effectiveTo());
        if (from.isBefore(availableFrom) || (availableTo != null && (to == null || to.isAfter(availableTo)))) {
            throw badRequest("ITEM_MAPPING_OUTSIDE_STANDARD_PERIOD", "映射有效期必须位于编码发布版和标准术语有效期内");
        }
    }

    private void requireAuthority(String mappingType, String authorityType) {
        boolean valid = switch (mappingType) {
            case "INSURANCE" -> "INSURANCE".equals(authorityType);
            case "REGULATORY" -> Set.of("NATIONAL", "REGULATORY").contains(authorityType);
            case "LOCAL" -> Set.of("LOCAL", "INTERNAL").contains(authorityType);
            default -> true;
        };
        if (!valid) throw badRequest("ITEM_MAPPING_AUTHORITY_MISMATCH", "映射用途与标准发布权威类型不匹配");
    }

    private void requireCommand(String mappingType, String equivalence, LocalDate from, LocalDate to) {
        if (!MAPPING_TYPES.contains(mappingType)) throw badRequest("ITEM_MAPPING_TYPE_INVALID", "标准映射用途不正确");
        if (!EQUIVALENCES.contains(equivalence)) throw badRequest("ITEM_MAPPING_EQUIVALENCE_INVALID", "映射等价关系不正确");
        if (from == null || (to != null && to.isBefore(from))) {
            throw badRequest("ITEM_MAPPING_PERIOD_INVALID", "映射失效日期不能早于生效日期");
        }
    }

    private List<ItemTermMappingView> views(Long tenantId, ItemAttributeSubject subject,
                                            List<ItemTermMapping> mappings) {
        if (mappings.isEmpty()) return List.of();
        Map<Long, ConceptSnapshot> concepts = terminologyDirectory.findConcepts(mappings.stream()
                        .map(ItemTermMapping::conceptId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(ConceptSnapshot::id, Function.identity()));
        Map<Long, CodeSystemSnapshot> systems = terminologyDirectory.findCodeSystems(concepts.values().stream()
                        .map(ConceptSnapshot::codeSystemId).collect(Collectors.toSet())).stream()
                .filter(value -> visible(tenantId, value))
                .collect(Collectors.toMap(CodeSystemSnapshot::id, Function.identity()));
        return mappings.stream().map(value -> {
            ConceptSnapshot concept = concepts.get(value.conceptId());
            CodeSystemSnapshot system = concept == null ? null : systems.get(concept.codeSystemId());
            if (concept == null || system == null) throw new IllegalStateException("标准映射引用的术语发布版不存在");
            return new ItemTermMappingView(value.id(), value.revision(), subject.id(), subject.subjectType(),
                    targetId(subject), concept.id(), system.id(), system.code(), system.name(), system.versionCode(),
                    system.authorityType(), concept.code(), concept.display(), value.mappingType(),
                    value.equivalence(), value.primaryMapping(), value.limitation(), value.validFrom(), value.validTo(),
                    value.status(), value.replacesMappingId(), value.createdAt(), value.createdBy(),
                    value.updatedAt(), value.updatedBy());
        }).toList();
    }

    private ItemAttributeSubject requireSubject(Long tenantId, String subjectType, Long targetId) {
        if (!SUBJECT_TYPES.contains(subjectType)) {
            throw badRequest("ITEM_MAPPING_SUBJECT_TYPE_INVALID", "标准映射仅支持诊疗目录项目和通用药品");
        }
        return ("MEDICATION".equals(subjectType)
                ? subjectRepository.findByTenantIdAndMedicationId(tenantId, targetId)
                : subjectRepository.findByTenantIdAndCatalogItemId(tenantId, targetId))
                .orElseThrow(() -> notFound("ITEM_MAPPING_SUBJECT_NOT_FOUND", "未找到需要维护标准映射的基础数据"));
    }

    private CodeSystemSnapshot requireVisibleSystem(Long tenantId, Long id) {
        return terminologyDirectory.findCodeSystem(id).filter(value -> visible(tenantId, value))
                .orElseThrow(() -> notFound("STANDARD_CODE_SYSTEM_NOT_FOUND", "未找到可用的标准编码发布版"));
    }

    private boolean visible(Long tenantId, CodeSystemSnapshot value) {
        return "PRODUCT".equals(value.scopeType())
                || ("TENANT".equals(value.scopeType()) && tenantId.equals(value.scopeId()));
    }

    private StandardCodeSystemView systemView(CodeSystemSnapshot value) {
        return new StandardCodeSystemView(value.id(), value.code(), value.name(), value.versionCode(),
                value.systemType(), value.authorityType(), value.publisher(), value.status(),
                value.effectiveFrom(), value.effectiveTo(), value.canonicalUri(), value.sourceUri(), value.contentHash());
    }

    private StandardTermView termView(ConceptSnapshot value, CodeSystemSnapshot system) {
        return new StandardTermView(value.id(), system.id(), system.code(), system.name(), system.versionCode(),
                system.authorityType(), value.code(), value.display(), value.shortDisplay(), value.conceptType(),
                value.status(), value.effectiveFrom(), value.effectiveTo());
    }

    private boolean effectiveAt(ItemTermMappingView value, LocalDate date) {
        return !"SUSPENDED".equals(value.status()) && !value.validFrom().isAfter(date)
                && (value.validTo() == null || !value.validTo().isBefore(date));
    }

    private Long targetId(ItemAttributeSubject subject) {
        return "MEDICATION".equals(subject.subjectType()) ? subject.medicationId() : subject.catalogItemId();
    }

    private Long actor(ExecutionContext context) {
        if (context.subjectId() == null) throw badRequest("ACTOR_REQUIRED", "当前操作缺少可审计用户身份");
        return context.subjectId();
    }

    private ExecutionContext current() { return contextProvider.requireCurrent(); }
    private boolean blank(String value) { return value == null || value.isBlank(); }
    private String clean(String value) { return blank(value) ? null : value.trim(); }
    private String normalizeQuery(String value) { return blank(value) ? "" : value.trim().toLowerCase(Locale.ROOT); }
    private boolean contains(String value, String query) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(query);
    }
    private int scoreMatch(ConceptSnapshot value, String normalized) {
        if (normalized.isBlank()) return 10;
        String code = value.code() == null ? "" : value.code().toLowerCase(Locale.ROOT);
        String display = value.display() == null ? "" : value.display().toLowerCase(Locale.ROOT);
        String shortDisplay = value.shortDisplay() == null ? "" : value.shortDisplay().toLowerCase(Locale.ROOT);
        String searchCode = value.searchCode() == null ? "" : value.searchCode().toLowerCase(Locale.ROOT);
        if (normalized.equals(code)) return 0;
        if (normalized.equals(shortDisplay)) return 1;
        if (normalized.equals(display)) return 2;
        if (code.startsWith(normalized)) return 3;
        if (shortDisplay.startsWith(normalized)) return 4;
        if (display.startsWith(normalized)) return 5;
        if (searchCode.startsWith(normalized)) return 6;
        return 7;
    }

    private LocalDate earliest(LocalDate left, LocalDate right) {
        if (left == null) return right;
        if (right == null) return left;
        return left.isBefore(right) ? left : right;
    }
}
