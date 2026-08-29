package com.rhn.platform.organization.application;

import cn.hutool.core.util.StrUtil;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.organization.api.DepartmentProfileView;
import com.rhn.platform.organization.api.DepartmentExtensionSynchronizer;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDictionaryCodes;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.platform.organization.domain.Department;
import com.rhn.platform.organization.domain.OrganizationKind;
import com.rhn.platform.organization.domain.OrganizationStatus;
import com.rhn.platform.organization.domain.PersonnelAssignment;
import com.rhn.platform.organization.domain.StaleOrganizationRevisionException;
import com.rhn.platform.organization.infrastructure.DepartmentProfileStore;
import com.rhn.platform.organization.infrastructure.DepartmentRepository;
import com.rhn.platform.organization.infrastructure.OrganizationRepository;
import com.rhn.platform.organization.infrastructure.PersonnelAssignmentRepository;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class DepartmentApplicationService {
    private final DepartmentRepository repository;
    private final DepartmentProfileStore profileStore;
    private final PersonnelAssignmentRepository assignmentRepository;
    private final DictionaryDirectory dictionaryDirectory;
    private final ExecutionContextProvider contextProvider;
    private final OrganizationRepository organizationRepository;
    private final List<DepartmentExtensionSynchronizer> extensionSynchronizers;

    public DepartmentApplicationService(DepartmentRepository repository, DepartmentProfileStore profileStore,
                                        PersonnelAssignmentRepository assignmentRepository,
                                        DictionaryDirectory dictionaryDirectory,
                                        ExecutionContextProvider contextProvider,
                                        OrganizationRepository organizationRepository,
                                        List<DepartmentExtensionSynchronizer> extensionSynchronizers) {
        this.repository = repository;
        this.profileStore = profileStore;
        this.assignmentRepository = assignmentRepository;
        this.dictionaryDirectory = dictionaryDirectory;
        this.contextProvider = contextProvider;
        this.organizationRepository = organizationRepository;
        this.extensionSynchronizers = extensionSynchronizers;
    }

    @Transactional
    public DepartmentView create(Long tenantId, Long organizationId, Long parentId, String code, String name,
                                 String shortName, String description, String type, String property,
                                 boolean virtual, int sortOrder, LocalDate validFrom, LocalDate validTo) {
        requireOrganization(tenantId, organizationId);
        validateParent(tenantId, organizationId, null, parentId);
        String normalizedCode = normalizeCode(code);
        if (repository.findByTenantIdAndOrganizationIdAndCode(tenantId, organizationId, normalizedCode).isPresent()) {
            throw conflict("DEPARTMENT_CODE_DUPLICATE", "同一机构内科室代码已经存在");
        }
        String normalizedType = dictionaryItem(tenantId, OrganizationDictionaryCodes.DEPARTMENT_TYPE, type, "科室类型");
        String normalizedProperty = optionalDictionaryItem(tenantId, OrganizationDictionaryCodes.DEPARTMENT_PROPERTY,
                property, "科室属性");
        DepartmentView value = save(() -> repository.saveAndFlush(new Department(tenantId, organizationId, parentId,
                        normalizedCode, name.trim(), trimToNull(shortName), trimToNull(description), normalizedType,
                        normalizedProperty, virtual, sortOrder, validFrom, validTo, actorId())).toView(),
                "DEPARTMENT_CODE_DUPLICATE", "同一机构内科室代码已经存在");
        synchronizeExtensions(tenantId, value);
        return value;
    }

    @Transactional
    public DepartmentView update(Long id, long expectedRevision, Long parentId, String name, String shortName,
                                 String description, String type, String property, boolean virtual, int sortOrder,
                                 LocalDate validFrom, LocalDate validTo) {
        Department department = requireEntity(currentTenant(), id);
        validateParent(department.tenantId(), department.organizationId(), id, parentId);
        String normalizedType = dictionaryItem(department.tenantId(), OrganizationDictionaryCodes.DEPARTMENT_TYPE,
                type, "科室类型");
        String normalizedProperty = optionalDictionaryItem(department.tenantId(),
                OrganizationDictionaryCodes.DEPARTMENT_PROPERTY, property, "科室属性");
        try {
            department.update(parentId, name.trim(), trimToNull(shortName), trimToNull(description),
                    normalizedType, normalizedProperty, virtual, sortOrder, validFrom, validTo,
                    expectedRevision, actorId());
            DepartmentView value = repository.saveAndFlush(department).toView();
            synchronizeExtensions(department.tenantId(), value);
            return value;
        } catch (StaleOrganizationRevisionException exception) {
            throw conflict("DEPARTMENT_REVISION_CONFLICT", "科室已被其他用户修改，请刷新后重试");
        } catch (IllegalArgumentException exception) {
            throw badRequest("VALIDITY_PERIOD_INVALID", "有效期结束日期不能早于开始日期");
        }
    }

    @Transactional
    public DepartmentView changeStatus(Long id, long expectedRevision, OrganizationStatus status) {
        Department department = requireEntity(currentTenant(), id);
        if (status == OrganizationStatus.MERGED) {
            throw badRequest("DEPARTMENT_MERGE_TARGET_REQUIRED", "科室合并需要指定目标科室");
        }
        try {
            department.changeStatus(status, expectedRevision, actorId());
            DepartmentView value = repository.saveAndFlush(department).toView();
            synchronizeExtensions(department.tenantId(), value);
            return value;
        } catch (StaleOrganizationRevisionException exception) {
            throw conflict("DEPARTMENT_REVISION_CONFLICT", "科室已被其他用户修改，请刷新后重试");
        }
    }

    private void synchronizeExtensions(Long tenantId, DepartmentView department) {
        extensionSynchronizers.forEach(extension -> extension.synchronize(tenantId, department, actorId()));
    }

    @Transactional(readOnly = true)
    public List<DepartmentView> list(Long tenantId, Long organizationId) {
        requireOrganization(tenantId, organizationId);
        return repository.findByTenantIdAndOrganizationIdOrderBySortOrderAscCodeAsc(tenantId, organizationId)
                .stream().map(Department::toView).toList();
    }

    @Transactional(readOnly = true)
    public List<OrganizationView> compatibilityNodes(Long tenantId) {
        return repository.findByTenantIdOrderByOrganizationIdAscSortOrderAscCodeAsc(tenantId)
                .stream().map(this::compatibilityView).toList();
    }

    @Transactional(readOnly = true)
    public boolean exists(Long tenantId, Long id) {
        return repository.findByIdAndTenantId(id, tenantId).isPresent();
    }

    @Transactional(readOnly = true)
    public Long resolveOrganizationId(Long tenantId, Long parentOrOrganizationId) {
        Department parent = repository.findByIdAndTenantId(parentOrOrganizationId, tenantId).orElse(null);
        if (parent != null) return parent.organizationId();
        requireOrganization(tenantId, parentOrOrganizationId);
        return parentOrOrganizationId;
    }

    public OrganizationView compatibilityView(DepartmentView value) {
        Long compatibilityParentId = value.parentId() == null ? value.organizationId() : value.parentId();
        return new OrganizationView(value.id(), value.revision(), compatibilityParentId, value.mergedToId(),
                value.code(), value.name(), value.shortName(), value.description(), OrganizationKind.ORG_UNIT.name(),
                value.sdOrgType(), value.sdOrgStatus(), null, value.virtual(), value.sortOrder(), null,
                value.sdDepartmentType(), value.sdDepartmentProperty(), value.validFrom(), value.validTo(),
                value.createdAt(), value.updatedAt());
    }

    @Transactional(readOnly = true)
    public DepartmentView require(Long tenantId, Long organizationId, Long departmentId) {
        Department department = requireEntity(tenantId, departmentId);
        if (!department.organizationId().equals(organizationId)) {
            throw notFound("DEPARTMENT_NOT_FOUND", "未找到科室或科室不属于该机构");
        }
        return department.toView();
    }

    @Transactional(readOnly = true)
    public Department requireEntity(Long tenantId, Long departmentId) {
        return repository.findByIdAndTenantId(departmentId, tenantId)
                .orElseThrow(() -> notFound("DEPARTMENT_NOT_FOUND", "未找到科室"));
    }

    @Transactional(readOnly = true)
    public List<DepartmentView> lineage(Long tenantId, Long organizationId, Long departmentId) {
        Department department = requireEntity(tenantId, departmentId);
        if (!department.organizationId().equals(organizationId)) {
            throw notFound("DEPARTMENT_NOT_FOUND", "未找到科室或科室不属于该机构");
        }
        List<DepartmentView> lineage = new ArrayList<>();
        for (Department current = department; current != null; ) {
            lineage.add(current.toView());
            if (lineage.size() >= 64) throw hierarchyInvalid();
            current = current.parentId() == null ? null : requireEntity(tenantId, current.parentId());
        }
        return List.copyOf(lineage);
    }

    @Transactional(readOnly = true)
    public DepartmentProfileView profile(Long id) {
        return profileStore.load(requireEntity(currentTenant(), id));
    }

    @Transactional
    public DepartmentProfileView addContact(Long id, String type, String value, String use,
                                            boolean primary, int sortOrder, LocalDate from, LocalDate to) {
        Department department = requireEntity(currentTenant(), id);
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(department.tenantId(), OrganizationDictionaryCodes.CONTACT_TYPE,
                type, "联系方式类型");
        String normalizedUse = dictionaryItem(department.tenantId(), OrganizationDictionaryCodes.CONTACT_USE,
                use, "联系方式用途");
        return save(() -> {
            profileStore.addContact(department.tenantId(), id, normalizedType, value.trim(), normalizedUse,
                    primary, sortOrder, from, to);
            return profileStore.load(department);
        }, "DEPARTMENT_CONTACT_DUPLICATE", "相同科室联系方式已经存在");
    }

    @Transactional
    public DepartmentProfileView addRelation(Long id, Long targetId, String type, boolean primary,
                                             String description, LocalDate from, LocalDate to) {
        Department department = requireEntity(currentTenant(), id);
        if (id.equals(targetId)) throw badRequest("DEPARTMENT_RELATION_SELF", "科室不能与自身建立关系");
        requireEntity(department.tenantId(), targetId);
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(department.tenantId(),
                OrganizationDictionaryCodes.DEPARTMENT_RELATION_TYPE, type, "科室关系类型");
        return save(() -> {
            profileStore.addRelation(department.tenantId(), id, targetId, normalizedType, primary,
                    trimToNull(description), from, to);
            return profileStore.load(department);
        }, "DEPARTMENT_RELATION_DUPLICATE", "相同科室关系已经存在");
    }

    @Transactional
    public DepartmentProfileView addCapability(Long id, String type, String qualification, String scope,
                                               LocalDate from, LocalDate to, String verifyStatus) {
        Department department = requireEntity(currentTenant(), id);
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(department.tenantId(),
                OrganizationDictionaryCodes.DEPARTMENT_CAPABILITY_TYPE, type, "科室能力类型");
        String normalizedVerify = dictionaryItem(department.tenantId(), OrganizationDictionaryCodes.VERIFY_STATUS,
                verifyStatus, "核验状态");
        return save(() -> {
            profileStore.addCapability(department.tenantId(), id, normalizedType, trimToNull(qualification),
                    trimToNull(scope), from, to, normalizedVerify);
            return profileStore.load(department);
        }, "DEPARTMENT_CAPABILITY_DUPLICATE", "相同科室能力和生效日期已经存在");
    }

    @Transactional
    public DepartmentProfileView addResponsibility(Long id, Long assignmentId, String externalName,
                                                   String type, boolean primary, LocalDate from, LocalDate to) {
        Department department = requireEntity(currentTenant(), id);
        String normalizedExternalName = trimToNull(externalName);
        if ((assignmentId == null) == (normalizedExternalName == null)) {
            throw badRequest("DEPARTMENT_RESPONSIBILITY_SUBJECT_INVALID", "内部任职和外部负责人必须且只能填写一项");
        }
        if (assignmentId != null) {
            PersonnelAssignment assignment = assignmentRepository.findByIdAndTenantId(assignmentId, department.tenantId())
                    .orElseThrow(() -> notFound("ASSIGNMENT_NOT_FOUND", "未找到负责人任职"));
            if (!department.id().equals(assignment.departmentId())) {
                throw badRequest("DEPARTMENT_RESPONSIBILITY_ASSIGNMENT_INVALID", "负责人必须在当前科室有效任职");
            }
        }
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(department.tenantId(),
                OrganizationDictionaryCodes.DEPARTMENT_RESPONSIBILITY_TYPE, type, "科室负责人类型");
        return save(() -> {
            profileStore.addResponsibility(department.tenantId(), id, assignmentId, normalizedExternalName,
                    normalizedType, primary, from, to);
            return profileStore.load(department);
        }, "DEPARTMENT_RESPONSIBILITY_DUPLICATE", "相同科室负责人已经存在");
    }

    private OrganizationView compatibilityView(Department value) {
        return compatibilityView(value.toView());
    }

    private void validateParent(Long tenantId, Long organizationId, Long currentId, Long parentId) {
        if (parentId == null) return;
        if (parentId.equals(currentId)) throw badRequest("DEPARTMENT_PARENT_INVALID", "科室不能以自身作为上级");
        Department parent = requireEntity(tenantId, parentId);
        if (!parent.organizationId().equals(organizationId)) {
            throw badRequest("DEPARTMENT_PARENT_INVALID", "上级科室必须属于同一机构");
        }
        Set<Long> visited = new HashSet<>();
        for (Department current = parent; current != null; ) {
            if (!visited.add(current.id()) || current.id().equals(currentId) || visited.size() >= 64) {
                throw hierarchyInvalid();
            }
            current = current.parentId() == null ? null : requireEntity(tenantId, current.parentId());
        }
    }

    private void requireOrganization(Long tenantId, Long organizationId) {
        com.rhn.platform.organization.domain.Organization organization = organizationRepository
                .findByIdAndTenantId(organizationId, tenantId)
                .orElseThrow(() -> notFound("ORGANIZATION_NOT_FOUND", "未找到机构"));
        if (organization.organizationKind() != OrganizationKind.LEGAL_ORGANIZATION) {
            throw notFound("ORGANIZATION_NOT_FOUND", "未找到机构");
        }
    }

    private void validatePeriod(LocalDate from, LocalDate to) {
        try {
            com.rhn.platform.organization.domain.Organization.validateDates(from, to);
        } catch (IllegalArgumentException exception) {
            throw badRequest("VALIDITY_PERIOD_INVALID", "有效期结束日期不能早于开始日期");
        }
    }

    private String dictionaryItem(Long tenantId, String dictionaryCode, String value, String label) {
        String normalized = trimToNull(value);
        if (normalized == null) throw badRequest("DICTIONARY_VALUE_REQUIRED", label + "不能为空");
        if (dictionaryDirectory.resolveActiveItems(tenantId, dictionaryCode).stream()
                .noneMatch(item -> item.code().equals(normalized))) {
            throw badRequest("DICTIONARY_VALUE_INVALID", label + "不是当前可用字典项");
        }
        return normalized;
    }

    private String optionalDictionaryItem(Long tenantId, String code, String value, String label) {
        String normalized = trimToNull(value);
        return normalized == null ? null : dictionaryItem(tenantId, code, normalized, label);
    }

    private String normalizeCode(String value) {
        return StrUtil.trim(value).toUpperCase(java.util.Locale.ROOT);
    }

    private String trimToNull(String value) {
        return StrUtil.isBlank(value) ? null : value.trim();
    }

    private Long currentTenant() { return contextProvider.requireCurrent().tenantId(); }
    private Long actorId() { return contextProvider.requireCurrent().subjectId(); }

    private <T> T save(Action<T> action, String code, String message) {
        try {
            return action.execute();
        } catch (DataIntegrityViolationException exception) {
            throw conflict(code, message);
        }
    }

    private BusinessException hierarchyInvalid() {
        return conflict("DEPARTMENT_HIERARCHY_INVALID", "科室层级存在循环或层级过深");
    }
    private BusinessException notFound(String code, String message) {
        return new BusinessException(code, message, HttpStatus.NOT_FOUND);
    }
    private BusinessException conflict(String code, String message) {
        return new BusinessException(code, message, HttpStatus.CONFLICT);
    }
    private BusinessException badRequest(String code, String message) {
        return new BusinessException(code, message, HttpStatus.BAD_REQUEST);
    }

    @FunctionalInterface
    private interface Action<T> { T execute(); }
}
