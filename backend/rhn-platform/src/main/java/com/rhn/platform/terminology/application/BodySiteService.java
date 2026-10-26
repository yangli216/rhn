package com.rhn.platform.terminology.application;

import com.rhn.platform.terminology.api.BodySiteDirectory;
import com.rhn.platform.terminology.domain.CodeSystem;
import com.rhn.platform.terminology.domain.Concept;
import com.rhn.platform.terminology.domain.ConceptAlias;
import com.rhn.platform.terminology.domain.ConceptRelation;
import com.rhn.platform.terminology.domain.TerminologyScope;
import com.rhn.platform.terminology.domain.TerminologyStatus;
import com.rhn.platform.terminology.infrastructure.CodeSystemRepository;
import com.rhn.platform.terminology.infrastructure.ConceptAliasRepository;
import com.rhn.platform.terminology.infrastructure.ConceptRelationRepository;
import com.rhn.platform.terminology.infrastructure.ConceptRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

/** 检查部位词典：读取部位概念、别名与上级部位，维护 PART_OF 层级并防止成环。 */
@Service
public class BodySiteService implements BodySiteDirectory {
    private final CodeSystemRepository codeSystemRepository;
    private final ConceptRepository conceptRepository;
    private final ConceptAliasRepository aliasRepository;
    private final ConceptRelationRepository relationRepository;
    private final ExecutionContextProvider contextProvider;

    public BodySiteService(CodeSystemRepository codeSystemRepository, ConceptRepository conceptRepository,
                           ConceptAliasRepository aliasRepository, ConceptRelationRepository relationRepository,
                           ExecutionContextProvider contextProvider) {
        this.codeSystemRepository = codeSystemRepository;
        this.conceptRepository = conceptRepository;
        this.aliasRepository = aliasRepository;
        this.relationRepository = relationRepository;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional(readOnly = true)
    public List<BodySite> listBodySites(Long tenantId, LocalDate atDate) {
        List<Concept> concepts = activeConcepts(tenantId, atDate);
        Set<Long> ids = concepts.stream().map(Concept::id).collect(Collectors.toSet());
        Map<Long, List<String>> aliases = ids.isEmpty() ? Map.of() : aliasRepository.findByConceptIdIn(ids).stream()
                .filter(alias -> alias.status() == TerminologyStatus.ACTIVE)
                .sorted(Comparator.comparing(ConceptAlias::aliasName))
                .collect(Collectors.groupingBy(ConceptAlias::conceptId,
                        Collectors.mapping(ConceptAlias::aliasName, Collectors.toList())));
        Map<Long, List<Long>> parents = ids.isEmpty() ? Map.of() : relationRepository
                .findByRelationTypeAndConceptIdIn(ConceptRelation.PART_OF, ids).stream()
                .filter(ConceptRelation::active).filter(rel -> ids.contains(rel.targetConceptId()))
                .collect(Collectors.groupingBy(ConceptRelation::conceptId,
                        Collectors.mapping(ConceptRelation::targetConceptId, Collectors.toList())));
        return concepts.stream()
                .map(c -> new BodySite(c.id(), c.code(), c.display(), c.searchCode(),
                        List.copyOf(aliases.getOrDefault(c.id(), List.of())),
                        List.copyOf(parents.getOrDefault(c.id(), List.of()))))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<BodySite> findBodySite(Long tenantId, Long conceptId, LocalDate atDate) {
        if (conceptId == null) return Optional.empty();
        return listBodySites(tenantId, atDate).stream().filter(site -> site.conceptId().equals(conceptId)).findFirst();
    }

    /**
     * 整组替换部位的上级部位：上级必须是当前有效的部位，且不能形成环。
     * 不再列出的旧关系停用，重新列出的已停用关系恢复启用。
     */
    @Transactional
    public BodySite replaceParents(Long tenantId, Long conceptId, List<Long> parentConceptIds) {
        LocalDate today = LocalDate.now();
        Long actorId = contextProvider.requireCurrent().subjectId();
        Map<Long, BodySite> sites = listBodySites(tenantId, today).stream()
                .collect(Collectors.toMap(BodySite::conceptId, site -> site));
        if (!sites.containsKey(conceptId)) throw notFound("BODY_SITE_NOT_FOUND", "未找到当前有效的检查部位");
        Set<Long> targets = new LinkedHashSet<>(parentConceptIds == null ? List.of() : parentConceptIds);
        for (Long target : targets) {
            if (!sites.containsKey(target)) throw badRequest("BODY_SITE_PARENT_INVALID", "上级部位不存在或已停用");
            if (target.equals(conceptId) || reaches(sites, target, conceptId)) {
                throw conflict("BODY_SITE_HIERARCHY_CYCLE", "上级部位设置会形成循环层级");
            }
        }
        for (ConceptRelation existing : relationRepository.findByRelationTypeAndConceptId(ConceptRelation.PART_OF, conceptId)) {
            boolean keep = targets.remove(existing.targetConceptId());
            String status = keep ? "ACTIVE" : "INACTIVE";
            if (!status.equals(existing.status())) existing.changeStatus(status, actorId);
        }
        for (Long target : targets) {
            relationRepository.save(new ConceptRelation(conceptId, target, ConceptRelation.PART_OF, actorId));
        }
        relationRepository.flush();
        return findBodySite(tenantId, conceptId, today).orElseThrow();
    }

    /** from 沿上级链能否到达 to。 */
    private static boolean reaches(Map<Long, BodySite> sites, Long from, Long to) {
        Deque<Long> pending = new ArrayDeque<>(List.of(from));
        Set<Long> seen = new HashSet<>();
        while (!pending.isEmpty()) {
            Long current = pending.pop();
            if (current.equals(to)) return true;
            if (!seen.add(current)) continue;
            BodySite site = sites.get(current);
            if (site != null) pending.addAll(site.parentConceptIds());
        }
        return false;
    }

    private List<Concept> activeConcepts(Long tenantId, LocalDate atDate) {
        List<Long> systemIds = codeSystemRepository.findAll().stream()
                .filter(system -> CODE_SYSTEM.equals(system.code()))
                .filter(system -> system.status() == TerminologyStatus.ACTIVE && system.isEffectiveAt(atDate))
                .filter(system -> system.scopeType() == TerminologyScope.PRODUCT
                        || system.scopeType() == TerminologyScope.TENANT && tenantId.equals(system.scopeId()))
                .map(CodeSystem::id).toList();
        if (systemIds.isEmpty()) return List.of();
        return conceptRepository.findByCodeSystemIdInOrderByDisplay(systemIds).stream()
                .filter(Concept::isActive).filter(concept -> concept.isEffectiveAt(atDate))
                .sorted(Comparator.comparing(Concept::code))
                .toList();
    }
}
