package com.rhn.platform.identityaccess.application;

import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.identityaccess.api.WorkContextOption;
import com.rhn.platform.identityaccess.api.WorkContextType;
import com.rhn.platform.identityaccess.infrastructure.WorkContextProjectionRepository;
import com.rhn.platform.identityaccess.infrastructure.AuthorityProjectionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.time.Instant;

import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
class WorkContextService implements WorkContextDirectory {
    private final WorkContextProjectionRepository repository;
    private final AuthorityProjectionRepository authorityRepository;

    WorkContextService(WorkContextProjectionRepository repository,
                       AuthorityProjectionRepository authorityRepository) {
        this.repository = repository;
        this.authorityRepository = authorityRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<WorkContextOption> availableContexts(Long tenantId, Long userId) {
        if (userId == null) return List.of();
        Instant at = Instant.now();
        LinkedHashMap<Key, MutableContext> contexts = new LinkedHashMap<>();
        for (WorkContextProjectionRepository.Row row : repository.findAvailable(tenantId, userId)) {
            Key key = new Key(row.organizationId(), row.departmentId(), row.dataScopeType());
            contexts.computeIfAbsent(key, ignored -> new MutableContext(row)).roles.add(row.roleCode());
        }
        List<WorkContextOption> result = new ArrayList<>();
        contexts.values().forEach(value -> result.add(value.toOption(tenantId, userId, at)));
        return List.copyOf(result);
    }

    @Override
    @Transactional(readOnly = true)
    public WorkContextOption requireAuthorized(Long tenantId, Long userId, Long organizationId, Long departmentId) {
        return availableContexts(tenantId, userId).stream()
                .filter(context -> organizationId.equals(context.organizationId()))
                .filter(context -> departmentId == null || departmentId.equals(context.departmentId()))
                .findFirst()
                .orElseThrow(() -> forbidden("WORK_CONTEXT_FORBIDDEN", "无权使用所选机构或科室工作上下文"));
    }

    @Override
    @Transactional(readOnly = true)
    public Set<String> authoritiesFor(Long tenantId, Long userId, Long organizationId, Long departmentId) {
        if (tenantId == null || userId == null || organizationId == null) return Set.of();
        boolean authorized = repository.findAvailable(tenantId, userId).stream()
                .filter(context -> organizationId.equals(context.organizationId()))
                .anyMatch(context -> departmentId == null || departmentId.equals(context.departmentId()));
        if (!authorized) {
            throw forbidden("WORK_CONTEXT_FORBIDDEN", "无权使用所选机构或科室工作上下文");
        }
        return Set.copyOf(authorityRepository.findAuthoritiesForContext(
                tenantId, userId, organizationId, departmentId, Instant.now()));
    }

    private record Key(Long organizationId, Long departmentId, String dataScopeType) {
    }

    private final class MutableContext {
        private final WorkContextProjectionRepository.Row row;
        private final LinkedHashSet<String> roles = new LinkedHashSet<>();

        private MutableContext(WorkContextProjectionRepository.Row row) {
            this.row = row;
        }

        private WorkContextOption toOption(Long tenantId, Long userId, Instant at) {
            return new WorkContextOption(row.organizationId(), row.organizationName(), row.departmentId(),
                    row.departmentName(), workContextType(row), row.dataScopeType(), roles,
                    Set.copyOf(authorityRepository.findAuthoritiesForContext(tenantId, userId,
                            row.organizationId(), row.departmentId(), at)));
        }

        private WorkContextType workContextType(WorkContextProjectionRepository.Row value) {
            String departmentType = value.departmentType();
            if ("MED_PHARMACY_WAREHOUSE".equals(departmentType)) return WorkContextType.INVENTORY;
            if (departmentType != null && departmentType.startsWith("MED_PHARMACY")) {
                return WorkContextType.PHARMACY;
            }
            if ("CLINICAL".equals(value.departmentProperty())) return WorkContextType.CLINICAL;
            return WorkContextType.GENERAL;
        }
    }
}
