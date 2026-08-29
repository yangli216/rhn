package com.rhn.platform.organization.application;

import cn.hutool.core.util.StrUtil;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.EmploymentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationDictionaryCodes;
import com.rhn.platform.organization.api.OrganizationProfileView;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.platform.organization.api.PositionView;
import com.rhn.platform.organization.api.StaffAssignmentView;
import com.rhn.platform.organization.api.StaffDetailView;
import com.rhn.platform.organization.api.StaffView;
import com.rhn.platform.organization.api.TenantView;
import com.rhn.platform.organization.domain.AssignmentType;
import com.rhn.platform.organization.domain.Department;
import com.rhn.platform.organization.domain.Employment;
import com.rhn.platform.organization.domain.EmploymentType;
import com.rhn.platform.organization.domain.Organization;
import com.rhn.platform.organization.domain.OrganizationKind;
import com.rhn.platform.organization.domain.OrganizationStatus;
import com.rhn.platform.organization.domain.OrganizationType;
import com.rhn.platform.organization.domain.PersonnelAssignment;
import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.domain.Position;
import com.rhn.platform.organization.domain.PositionType;
import com.rhn.platform.organization.domain.Practitioner;
import com.rhn.platform.organization.domain.PractitionerGender;
import com.rhn.platform.organization.domain.StaleOrganizationRevisionException;
import com.rhn.platform.organization.domain.Tenant;
import com.rhn.platform.organization.infrastructure.EmploymentRepository;
import com.rhn.platform.organization.infrastructure.DepartmentRepository;
import com.rhn.platform.organization.infrastructure.OrganizationRepository;
import com.rhn.platform.organization.infrastructure.OrganizationProfileStore;
import com.rhn.platform.organization.infrastructure.PersonnelAssignmentRepository;
import com.rhn.platform.organization.infrastructure.PositionRepository;
import com.rhn.platform.organization.infrastructure.PractitionerRepository;
import com.rhn.platform.organization.infrastructure.TenantRepository;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class OrganizationApplicationService implements OrganizationDirectory {
    private static final Set<OrganizationType> LEGAL_TYPES = Set.of(
            OrganizationType.TOWNSHIP_HEALTH_CENTER, OrganizationType.COMMUNITY_HEALTH_CENTER,
            OrganizationType.HOSPITAL, OrganizationType.CLINIC);
    private static final Set<OrganizationType> UNIT_TYPES = Set.of(
            OrganizationType.CAMPUS, OrganizationType.CLINICAL_DEPARTMENT,
            OrganizationType.ADMINISTRATIVE_DEPARTMENT, OrganizationType.MEDICAL_TECHNOLOGY_DEPARTMENT,
            OrganizationType.NURSING_UNIT);

    private final TenantRepository tenantRepository;
    private final OrganizationRepository organizationRepository;
    private final PractitionerRepository practitionerRepository;
    private final EmploymentRepository employmentRepository;
    private final PositionRepository positionRepository;
    private final PersonnelAssignmentRepository assignmentRepository;
    private final DepartmentRepository departmentRepository;
    private final OrganizationProfileStore profileStore;
    private final DictionaryDirectory dictionaryDirectory;
    private final ExecutionContextProvider contextProvider;

    public OrganizationApplicationService(TenantRepository tenantRepository,
                                          OrganizationRepository organizationRepository,
                                          PractitionerRepository practitionerRepository,
                                          EmploymentRepository employmentRepository,
                                          PositionRepository positionRepository,
                                          PersonnelAssignmentRepository assignmentRepository,
                                          DepartmentRepository departmentRepository,
                                          OrganizationProfileStore profileStore,
                                          DictionaryDirectory dictionaryDirectory,
                                          ExecutionContextProvider contextProvider) {
        this.tenantRepository = tenantRepository;
        this.organizationRepository = organizationRepository;
        this.practitionerRepository = practitionerRepository;
        this.employmentRepository = employmentRepository;
        this.positionRepository = positionRepository;
        this.assignmentRepository = assignmentRepository;
        this.departmentRepository = departmentRepository;
        this.profileStore = profileStore;
        this.dictionaryDirectory = dictionaryDirectory;
        this.contextProvider = contextProvider;
    }

    @Transactional
    public TenantView createTenant(Long tenantId, String code, String name) {
        if (tenantRepository.existsById(tenantId) || tenantRepository.findByCode(code).isPresent()) {
            throw conflict("TENANT_DUPLICATE", "租户标识或代码已经存在");
        }
        return save(() -> tenantRepository.saveAndFlush(new Tenant(tenantId, code, name)).toView(),
                "TENANT_DUPLICATE", "租户代码已经存在");
    }

    @Transactional
    public OrganizationView createOrganization(Long tenantId, Long parentId, String code, String name,
                                               String shortName, String description,
                                               OrganizationKind kind, OrganizationType type,
                                               String organizationProperty, boolean virtual, int sortOrder,
                                               String timezoneCode, String departmentTypeCode,
                                               LocalDate validFrom, LocalDate validTo) {
        requireTenant(tenantId);
        validateOrganizationType(kind, type);
        validateParent(tenantId, null, parentId, kind);
        String normalizedProperty = optionalDictionaryItem(tenantId, OrganizationDictionaryCodes.PROPERTY,
                organizationProperty, "机构性质");
        String normalizedDepartmentType = departmentType(tenantId, kind, type, departmentTypeCode);
        String normalizedTimezone = timezone(timezoneCode);
        if (organizationRepository.findByTenantIdAndCode(tenantId, normalizeCode(code)).isPresent()) {
            throw conflict("ORGANIZATION_CODE_DUPLICATE", "组织代码已经存在");
        }
        try {
            return organizationRepository.saveAndFlush(new Organization(tenantId, parentId, normalizeCode(code),
                    name.trim(), trimToNull(shortName), trimToNull(description), kind, type, normalizedProperty,
                    virtual, sortOrder, normalizedTimezone, normalizedDepartmentType,
                    validFrom, validTo, actorId())).toView();
        } catch (IllegalArgumentException exception) {
            throw badRequest("VALIDITY_PERIOD_INVALID", "有效期结束日期不能早于开始日期");
        } catch (DataIntegrityViolationException exception) {
            throw conflict("ORGANIZATION_CODE_DUPLICATE", "组织代码已经存在");
        }
    }

    @Transactional
    public OrganizationView updateOrganization(Long id, long expectedRevision, Long parentId, String name,
                                               String shortName, String description, OrganizationType type,
                                               String organizationProperty, boolean virtual, int sortOrder,
                                               String timezoneCode, String departmentTypeCode,
                                               LocalDate validFrom, LocalDate validTo) {
        Organization organization = requireEntity(current().tenantId(), id);
        validateOrganizationType(organization.organizationKind(), type);
        validateParent(organization.tenantId(), id, parentId, organization.organizationKind());
        String normalizedProperty = optionalDictionaryItem(organization.tenantId(),
                OrganizationDictionaryCodes.PROPERTY, organizationProperty, "机构性质");
        String normalizedDepartmentType = departmentType(organization.tenantId(),
                organization.organizationKind(), type, departmentTypeCode);
        String normalizedTimezone = timezone(timezoneCode);
        try {
            organization.update(parentId, name.trim(), trimToNull(shortName), trimToNull(description), type,
                    normalizedProperty, virtual, sortOrder, normalizedTimezone, normalizedDepartmentType,
                    validFrom, validTo, expectedRevision, actorId());
            return organizationRepository.saveAndFlush(organization).toView();
        } catch (StaleOrganizationRevisionException exception) {
            throw conflict("ORGANIZATION_REVISION_CONFLICT", "组织已被其他用户修改，请刷新后重试");
        } catch (IllegalArgumentException exception) {
            throw badRequest("VALIDITY_PERIOD_INVALID", "有效期结束日期不能早于开始日期");
        }
    }

    @Transactional
    public OrganizationView changeOrganizationStatus(Long id, long expectedRevision, OrganizationStatus status) {
        Organization organization = requireEntity(current().tenantId(), id);
        if (status == OrganizationStatus.MERGED) {
            throw badRequest("ORGANIZATION_MERGE_TARGET_REQUIRED", "机构合并需要指定目标机构，本轮不通过普通状态操作完成");
        }
        try {
            organization.changeStatus(status, expectedRevision, actorId());
            return organizationRepository.saveAndFlush(organization).toView();
        } catch (StaleOrganizationRevisionException exception) {
            throw conflict("ORGANIZATION_REVISION_CONFLICT", "组织已被其他用户修改，请刷新后重试");
        }
    }

    @Transactional(readOnly = true)
    public List<OrganizationView> listOrganizationUnits(Long tenantId) {
        requireTenant(tenantId);
        return organizationRepository.findByTenantIdAndOrganizationKindOrderByCode(
                        tenantId, OrganizationKind.LEGAL_ORGANIZATION).stream()
                .map(Organization::toView).toList();
    }

    @Transactional(readOnly = true)
    public OrganizationProfileView getOrganizationProfile(Long id) {
        return profileStore.load(requireEntity(current().tenantId(), id));
    }

    @Transactional
    public OrganizationProfileView addIdentifier(Long id, String system, String code, String type,
                                                 Long issuerId, boolean primary, LocalDate from,
                                                 LocalDate to, String verifyStatus) {
        Organization organization = requireEntity(current().tenantId(), id);
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(organization.tenantId(), OrganizationDictionaryCodes.IDENTIFIER_TYPE,
                type, "标识类型");
        String normalizedVerify = dictionaryItem(organization.tenantId(), OrganizationDictionaryCodes.VERIFY_STATUS,
                verifyStatus, "核验状态");
        if (issuerId != null) requireEntity(organization.tenantId(), issuerId);
        return save(() -> {
            profileStore.addIdentifier(organization.tenantId(), id, system.trim(), code.trim(), normalizedType,
                    issuerId, primary, from, to, normalizedVerify);
            return profileStore.load(organization);
        }, "ORGANIZATION_IDENTIFIER_DUPLICATE", "相同标识体系和编码已经存在");
    }

    @Transactional
    public OrganizationProfileView addContact(Long id, String type, String value, String use,
                                              boolean primary, int sortOrder, LocalDate from, LocalDate to) {
        Organization organization = requireEntity(current().tenantId(), id);
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(organization.tenantId(), OrganizationDictionaryCodes.CONTACT_TYPE,
                type, "联系方式类型");
        String normalizedUse = dictionaryItem(organization.tenantId(), OrganizationDictionaryCodes.CONTACT_USE,
                use, "联系方式用途");
        return save(() -> {
            profileStore.addContact(organization.tenantId(), id, normalizedType, value.trim(), normalizedUse,
                    primary, sortOrder, from, to);
            return profileStore.load(organization);
        }, "ORGANIZATION_CONTACT_DUPLICATE", "相同联系方式已经存在");
    }

    @Transactional
    public OrganizationProfileView addAddress(Long id, String type, String country, String province,
                                              String city, String district, String street, String postal,
                                              LocalDate from, LocalDate to) {
        Organization organization = requireEntity(current().tenantId(), id);
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(organization.tenantId(), OrganizationDictionaryCodes.ADDRESS_TYPE,
                type, "地址类型");
        return save(() -> {
            profileStore.addAddress(organization.tenantId(), id, normalizedType, country.trim(),
                    trimToNull(province), trimToNull(city), trimToNull(district), street.trim(),
                    trimToNull(postal), from, to);
            return profileStore.load(organization);
        }, "ORGANIZATION_ADDRESS_DUPLICATE", "该地址类型和生效日期已经存在");
    }

    @Transactional
    public OrganizationProfileView addRelation(Long id, Long targetId, String type, boolean primary,
                                               String description, LocalDate from, LocalDate to) {
        Organization organization = requireEntity(current().tenantId(), id);
        if (id.equals(targetId)) throw badRequest("ORGANIZATION_RELATION_SELF", "组织不能与自身建立关联关系");
        requireEntity(organization.tenantId(), targetId);
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(organization.tenantId(), OrganizationDictionaryCodes.RELATION_TYPE,
                type, "组织关系类型");
        return save(() -> {
            profileStore.addRelation(organization.tenantId(), id, targetId, normalizedType, primary,
                    trimToNull(description), from, to);
            return profileStore.load(organization);
        }, "ORGANIZATION_RELATION_DUPLICATE", "相同组织关系已经存在");
    }

    @Transactional
    public OrganizationProfileView addCapability(Long id, String type, String qualification, String scope,
                                                 LocalDate from, LocalDate to, String verifyStatus) {
        Organization organization = requireEntity(current().tenantId(), id);
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(organization.tenantId(), OrganizationDictionaryCodes.CAPABILITY_TYPE,
                type, "服务能力类型");
        String normalizedVerify = dictionaryItem(organization.tenantId(), OrganizationDictionaryCodes.VERIFY_STATUS,
                verifyStatus, "核验状态");
        return save(() -> {
            profileStore.addCapability(organization.tenantId(), id, normalizedType, trimToNull(qualification),
                    trimToNull(scope), from, to, normalizedVerify);
            return profileStore.load(organization);
        }, "ORGANIZATION_CAPABILITY_DUPLICATE", "相同服务能力和生效日期已经存在");
    }

    @Transactional
    public OrganizationProfileView addResponsibility(Long id, Long assignmentId, String externalName,
                                                     String type, boolean primary, LocalDate from, LocalDate to) {
        Organization organization = requireEntity(current().tenantId(), id);
        String normalizedExternalName = trimToNull(externalName);
        if ((assignmentId == null) == (normalizedExternalName == null)) {
            throw badRequest("ORGANIZATION_RESPONSIBILITY_SUBJECT_INVALID", "内部任职和外部负责人姓名必须且只能填写一项");
        }
        if (assignmentId != null) {
            PersonnelAssignment assignment = assignmentRepository.findByIdAndTenantId(
                    assignmentId, organization.tenantId()).orElseThrow(() ->
                    notFound("ASSIGNMENT_NOT_FOUND", "未找到负责人任职"));
            if (!assignment.organizationId().equals(id)) {
                throw badRequest("ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_INVALID", "负责人任职不属于当前组织");
            }
        }
        validatePeriod(from, to);
        String normalizedType = dictionaryItem(organization.tenantId(),
                OrganizationDictionaryCodes.RESPONSIBILITY_TYPE, type, "负责人类型");
        return save(() -> {
            profileStore.addResponsibility(organization.tenantId(), id, assignmentId, normalizedExternalName,
                    normalizedType, primary, from, to);
            return profileStore.load(organization);
        }, "ORGANIZATION_RESPONSIBILITY_DUPLICATE", "相同负责人信息已经存在");
    }

    @Transactional
    public StaffView createStaff(Long tenantId, String code, String fullName, PractitionerGender gender) {
        requireTenant(tenantId);
        String normalizedCode = normalizeCode(code);
        if (practitionerRepository.findByTenantIdAndCode(tenantId, normalizedCode).isPresent()) {
            throw conflict("PRACTITIONER_CODE_DUPLICATE", "人员代码已经存在");
        }
        return save(() -> practitionerRepository.saveAndFlush(new Practitioner(
                        tenantId, normalizedCode, fullName.trim(), gender, actorId())).toView(),
                "PRACTITIONER_CODE_DUPLICATE", "人员代码已经存在");
    }

    @Transactional
    public StaffView updateStaff(Long id, long expectedRevision, String fullName, PractitionerGender gender) {
        Practitioner practitioner = requirePractitioner(current().tenantId(), id);
        try {
            practitioner.update(fullName.trim(), gender, expectedRevision, actorId());
            return practitionerRepository.saveAndFlush(practitioner).toView();
        } catch (StaleOrganizationRevisionException exception) {
            throw conflict("PRACTITIONER_REVISION_CONFLICT", "人员已被其他用户修改，请刷新后重试");
        }
    }

    @Transactional
    public StaffView changeStaffStatus(Long id, long expectedRevision, PersonnelStatus status) {
        Practitioner practitioner = requirePractitioner(current().tenantId(), id);
        try {
            practitioner.changeStatus(status, expectedRevision, actorId());
            return practitionerRepository.saveAndFlush(practitioner).toView();
        } catch (StaleOrganizationRevisionException exception) {
            throw conflict("PRACTITIONER_REVISION_CONFLICT", "人员已被其他用户修改，请刷新后重试");
        }
    }

    @Transactional
    public PositionView createPosition(String code, String name, PositionType type, String dutyDescription) {
        ExecutionContext context = current();
        String normalizedCode = normalizeCode(code);
        if (positionRepository.existsByTenantIdAndCode(context.tenantId(), normalizedCode)) {
            throw conflict("POSITION_CODE_DUPLICATE", "岗位代码已经存在");
        }
        Position position = positionRepository.saveAndFlush(new Position(context.tenantId(), normalizedCode,
                name.trim(), type, trimToNull(dutyDescription), context.subjectId()));
        return positionView(position);
    }

    @Transactional
    public EmploymentView createEmployment(Long practitionerId, Long organizationId, String code,
                                           EmploymentType type, boolean primaryEmployment,
                                           LocalDate hireDate, LocalDate leaveDate) {
        ExecutionContext context = current();
        Practitioner practitioner = requirePractitioner(context.tenantId(), practitionerId);
        if (practitioner.status() != PersonnelStatus.ACTIVE) {
            throw conflict("PRACTITIONER_INACTIVE", "停用人员不能新增聘用关系");
        }
        Organization organization = requireEntity(context.tenantId(), organizationId);
        requireKind(organization, OrganizationKind.LEGAL_ORGANIZATION, "EMPLOYMENT_ORGANIZATION_INVALID",
                "聘用机构必须是法定机构");
        String normalizedCode = normalizeCode(code);
        if (employmentRepository.existsByTenantIdAndCode(context.tenantId(), normalizedCode)) {
            throw conflict("EMPLOYMENT_CODE_DUPLICATE", "聘用代码已经存在");
        }
        List<Employment> currentEmployments = employmentRepository
                .findByTenantIdAndPractitionerIdOrderByHireDateDesc(context.tenantId(), practitionerId);
        if (primaryEmployment && currentEmployments.stream().anyMatch(value -> value.primaryEmployment()
                && value.status() == PersonnelStatus.ACTIVE
                && periodsOverlap(hireDate, leaveDate, value.hireDate(), value.leaveDate()))) {
            throw conflict("PRIMARY_EMPLOYMENT_OVERLAP", "同一人员在重叠有效期内只能有一个主任职聘用关系");
        }
        try {
            Employment employment = employmentRepository.saveAndFlush(new Employment(context.tenantId(),
                    practitionerId, organizationId, normalizedCode, type, primaryEmployment,
                    hireDate, leaveDate, context.subjectId()));
            return employmentView(employment, organization.name());
        } catch (IllegalArgumentException exception) {
            throw badRequest("VALIDITY_PERIOD_INVALID", "离职日期不能早于入职日期");
        }
    }

    @Transactional
    public StaffAssignmentView createAssignment(Long employmentId, Long organizationId, Long departmentId,
                                                Long positionId,
                                                String code, AssignmentType type, String specialtyCode,
                                                boolean primaryAssignment, BigDecimal workloadPercent,
                                                LocalDate validFrom, LocalDate validTo) {
        ExecutionContext context = current();
        Employment employment = employmentRepository.findByIdAndTenantId(employmentId, context.tenantId())
                .orElseThrow(() -> notFound("EMPLOYMENT_NOT_FOUND", "未找到聘用关系"));
        if (employment.status() != PersonnelStatus.ACTIVE) {
            throw conflict("EMPLOYMENT_INACTIVE", "停用聘用关系不能新增任职");
        }
        if (validFrom.isBefore(employment.hireDate())
                || employment.leaveDate() != null && (validTo == null || validTo.isAfter(employment.leaveDate()))) {
            throw badRequest("ASSIGNMENT_PERIOD_OUTSIDE_EMPLOYMENT", "任职有效期必须位于聘用有效期内");
        }
        if (!employment.organizationId().equals(organizationId)) {
            throw badRequest("ASSIGNMENT_ORGANIZATION_INVALID", "任职机构必须与聘用机构一致");
        }
        Organization organization = requireEntity(context.tenantId(), organizationId);
        requireKind(organization, OrganizationKind.LEGAL_ORGANIZATION,
                "ASSIGNMENT_ORGANIZATION_INVALID", "任职机构无效");
        Department department = requireDepartmentEntity(context.tenantId(), organizationId, departmentId);
        Position position = positionRepository.findByIdAndTenantId(positionId, context.tenantId())
                .orElseThrow(() -> notFound("POSITION_NOT_FOUND", "未找到标准岗位"));
        if (position.status() != PersonnelStatus.ACTIVE) {
            throw conflict("POSITION_INACTIVE", "停用岗位不能用于新任职");
        }
        if (workloadPercent != null && (workloadPercent.signum() < 0
                || workloadPercent.compareTo(BigDecimal.valueOf(100)) > 0)) {
            throw badRequest("ASSIGNMENT_WORKLOAD_INVALID", "工作量比例必须在 0 到 100 之间");
        }
        String normalizedCode = normalizeCode(code);
        if (assignmentRepository.existsByTenantIdAndCode(context.tenantId(), normalizedCode)) {
            throw conflict("ASSIGNMENT_CODE_DUPLICATE", "任职代码已经存在");
        }
        List<PersonnelAssignment> existing = assignments(context.tenantId(), List.of(employmentId));
        if (primaryAssignment && existing.stream().anyMatch(value -> value.primaryAssignment()
                && value.departmentId().equals(departmentId)
                && value.status() == PersonnelStatus.ACTIVE
                && periodsOverlap(validFrom, validTo, value.validFrom(), value.validTo()))) {
            throw conflict("PRIMARY_ASSIGNMENT_OVERLAP", "同一聘用关系在同一组织的重叠有效期内只能有一个主任职任职");
        }
        try {
            PersonnelAssignment assignment = assignmentRepository.saveAndFlush(new PersonnelAssignment(
                    context.tenantId(), employmentId, organizationId, departmentId, positionId, normalizedCode, type,
                    trimToNull(specialtyCode), primaryAssignment, workloadPercent,
                    validFrom, validTo, context.subjectId()));
            return assignmentView(assignment, organization.name(), department.name(),
                    position.name(), position.positionType());
        } catch (IllegalArgumentException exception) {
            throw badRequest("VALIDITY_PERIOD_INVALID", "任职结束日期不能早于开始日期");
        }
    }

    @Transactional(readOnly = true)
    public List<StaffView> listStaff(Long tenantId) {
        requireTenant(tenantId);
        return practitionerRepository.findByTenantIdOrderByCode(tenantId).stream().map(Practitioner::toView).toList();
    }

    @Transactional(readOnly = true)
    public StaffDetailView getStaff(Long practitionerId) {
        return requireStaff(current().tenantId(), practitionerId);
    }

    @Override
    @Transactional(readOnly = true)
    public StaffDetailView requireStaff(Long tenantId, Long practitionerId) {
        requireTenant(tenantId);
        Practitioner practitioner = requirePractitioner(tenantId, practitionerId);
        List<Employment> employments = employmentRepository
                .findByTenantIdAndPractitionerIdOrderByHireDateDesc(tenantId, practitionerId);
        List<EmploymentView> employmentViews = employments.stream().map(value -> employmentView(value,
                requireEntity(tenantId, value.organizationId()).name())).toList();
        List<PersonnelAssignment> assignments = assignments(tenantId, employments.stream().map(Employment::id).toList());
        List<StaffAssignmentView> assignmentViews = assignments.stream().map(value -> {
            Position position = requirePosition(tenantId, value.positionId());
            return assignmentView(value, requireEntity(tenantId, value.organizationId()).name(),
                    requireDepartmentEntity(tenantId, value.organizationId(), value.departmentId()).name(),
                    position.name(), position.positionType());
        }).toList();
        return new StaffDetailView(practitioner.toView(), employmentViews, assignmentViews);
    }

    @Transactional(readOnly = true)
    public List<PositionView> listPositions(Long tenantId) {
        requireTenant(tenantId);
        return positionRepository.findByTenantIdOrderByCode(tenantId).stream().map(this::positionView).toList();
    }

    @Transactional(readOnly = true)
    public List<OrganizationView> listOrganizations(Long tenantId) {
        requireTenant(tenantId);
        return organizationRepository.findByTenantIdAndOrganizationKindOrderByCode(
                tenantId, OrganizationKind.LEGAL_ORGANIZATION).stream().map(Organization::toView).toList();
    }

    @Transactional(readOnly = true)
    public List<DepartmentView> listDepartments(Long tenantId, Long organizationId) {
        requireOrganization(tenantId, organizationId);
        return departmentRepository.findByTenantIdAndOrganizationIdOrderBySortOrderAscCodeAsc(tenantId, organizationId)
                .stream().map(Department::toView).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public TenantView requireTenant(Long tenantId) {
        return tenantRepository.findById(tenantId).map(Tenant::toView)
                .orElseThrow(() -> notFound("TENANT_NOT_FOUND", "未找到租户"));
    }

    @Override
    @Transactional(readOnly = true)
    public OrganizationView requireOrganization(Long tenantId, Long organizationId) {
        Organization organization = requireEntity(tenantId, organizationId);
        requireKind(organization, OrganizationKind.LEGAL_ORGANIZATION,
                "ORGANIZATION_NOT_FOUND", "未找到机构");
        return organization.toView();
    }

    @Override
    @Transactional(readOnly = true)
    public DepartmentView requireDepartment(Long tenantId, Long organizationId, Long departmentId) {
        return requireDepartmentEntity(tenantId, organizationId, departmentId).toView();
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrganizationView> organizationLineage(Long tenantId, Long organizationId) {
        List<OrganizationView> lineage = new ArrayList<>();
        Organization current = requireEntity(tenantId, organizationId);
        requireKind(current, OrganizationKind.LEGAL_ORGANIZATION,
                "ORGANIZATION_NOT_FOUND", "未找到机构");
        for (Long id = current.id(); id != null; ) {
            Organization value = requireEntity(tenantId, id);
            if (value.organizationKind() != OrganizationKind.LEGAL_ORGANIZATION) break;
            lineage.add(value.toView());
            if (lineage.size() >= 64) throw hierarchyInvalid();
            id = value.parentId();
        }
        return List.copyOf(lineage);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DepartmentView> departmentLineage(Long tenantId, Long organizationId, Long departmentId) {
        Department department = requireDepartmentEntity(tenantId, organizationId, departmentId);
        List<DepartmentView> lineage = new ArrayList<>();
        for (Department value = department; value != null; ) {
            lineage.add(value.toView());
            if (lineage.size() >= 64) throw hierarchyInvalid();
            value = value.parentId() == null ? null
                    : requireDepartmentEntity(tenantId, organizationId, value.parentId());
        }
        return List.copyOf(lineage);
    }

    private void validateOrganizationType(OrganizationKind kind, OrganizationType type) {
        if (kind == null || type == null || kind == OrganizationKind.LEGAL_ORGANIZATION && !LEGAL_TYPES.contains(type)
                || kind == OrganizationKind.ORG_UNIT && !UNIT_TYPES.contains(type)) {
            throw badRequest("ORGANIZATION_TYPE_MISMATCH", "组织类型与组织类别不匹配");
        }
    }

    private void validateParent(Long tenantId, Long currentId, Long parentId, OrganizationKind kind) {
        if (parentId == null) {
            if (kind == OrganizationKind.ORG_UNIT) {
                throw badRequest("ORGANIZATION_PARENT_REQUIRED", "科室或组织单元必须有上级组织");
            }
            return;
        }
        if (parentId.equals(currentId)) throw badRequest("ORGANIZATION_PARENT_INVALID", "组织不能以自身作为上级");
        Organization parent = requireEntity(tenantId, parentId);
        if (kind == OrganizationKind.LEGAL_ORGANIZATION
                && parent.organizationKind() != OrganizationKind.LEGAL_ORGANIZATION) {
            throw badRequest("ORGANIZATION_PARENT_INVALID", "法定机构的上级必须是法定机构");
        }
        Set<Long> visited = new HashSet<>();
        for (Organization value = parent; value != null; ) {
            if (!visited.add(value.id()) || value.id().equals(currentId)) throw hierarchyInvalid();
            value = value.parentId() == null ? null : requireEntity(tenantId, value.parentId());
        }
    }

    private boolean belongsTo(Long tenantId, Organization unit, Long legalOrganizationId) {
        Set<Long> visited = new HashSet<>();
        for (Organization current = unit; current != null; ) {
            if (!visited.add(current.id()) || visited.size() >= 64) throw hierarchyInvalid();
            if (current.id().equals(legalOrganizationId)) return true;
            current = current.parentId() == null ? null : requireEntity(tenantId, current.parentId());
        }
        return false;
    }

    private Organization requireEntity(Long tenantId, Long id) {
        return organizationRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("ORGANIZATION_NOT_FOUND", "未找到组织"));
    }

    private Practitioner requirePractitioner(Long tenantId, Long id) {
        return practitionerRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("PRACTITIONER_NOT_FOUND", "未找到人员"));
    }

    private Position requirePosition(Long tenantId, Long id) {
        return positionRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("POSITION_NOT_FOUND", "未找到标准岗位"));
    }

    private void requireKind(Organization organization, OrganizationKind kind, String code, String message) {
        if (organization.organizationKind() != kind) throw notFound(code, message);
    }

    private EmploymentView employmentView(Employment value, String organizationName) {
        return new EmploymentView(value.id(), value.revision(), value.practitionerId(), value.organizationId(),
                organizationName, value.code(), value.employmentType(), value.primaryEmployment(),
                value.hireDate(), value.leaveDate(), value.status());
    }

    private PositionView positionView(Position value) {
        return new PositionView(value.id(), value.revision(), value.code(), value.name(), value.positionType(),
                value.dutyDescription(), value.status());
    }

    private StaffAssignmentView assignmentView(PersonnelAssignment value, String organizationName,
                                               String departmentName, String positionName,
                                               PositionType positionType) {
        return new StaffAssignmentView(value.id(), value.revision(), value.employmentId(), value.organizationId(),
                organizationName, value.departmentId(), departmentName, value.positionId(), positionName,
                positionType, value.code(), value.assignmentType(),
                value.specialtyCode(), value.primaryAssignment(), value.workloadPercent(), value.status(),
                value.validFrom(), value.validTo());
    }

    private List<PersonnelAssignment> assignments(Long tenantId, List<Long> employmentIds) {
        return employmentIds.isEmpty() ? List.of()
                : assignmentRepository.findByTenantIdAndEmploymentIdInOrderByValidFromDesc(tenantId, employmentIds);
    }

    private Department requireDepartmentEntity(Long tenantId, Long organizationId, Long departmentId) {
        Department department = departmentRepository.findByIdAndTenantId(departmentId, tenantId)
                .orElseThrow(() -> notFound("DEPARTMENT_NOT_FOUND", "未找到科室"));
        if (!department.organizationId().equals(organizationId)) {
            throw notFound("DEPARTMENT_NOT_FOUND", "未找到科室或科室不属于该机构");
        }
        return department;
    }

    private boolean periodsOverlap(LocalDate leftStart, LocalDate leftEnd,
                                   LocalDate rightStart, LocalDate rightEnd) {
        return (leftEnd == null || !leftEnd.isBefore(rightStart))
                && (rightEnd == null || !rightEnd.isBefore(leftStart));
    }

    private String normalizeCode(String value) {
        return StrUtil.trim(value).toUpperCase(java.util.Locale.ROOT);
    }

    private String trimToNull(String value) {
        return StrUtil.isBlank(value) ? null : value.trim();
    }

    private String departmentType(Long tenantId, OrganizationKind kind, OrganizationType structuralType,
                                  String value) {
        if (kind != OrganizationKind.ORG_UNIT || structuralType == OrganizationType.CAMPUS) return null;
        return dictionaryItem(tenantId, OrganizationDictionaryCodes.DEPARTMENT_TYPE, value, "科室类型");
    }

    private String optionalDictionaryItem(Long tenantId, String dictionaryCode, String value, String label) {
        String normalized = trimToNull(value);
        return normalized == null ? null : dictionaryItem(tenantId, dictionaryCode, normalized, label);
    }

    private String dictionaryItem(Long tenantId, String dictionaryCode, String value, String label) {
        String normalized = trimToNull(value);
        if (normalized == null) throw badRequest("DICTIONARY_VALUE_REQUIRED", label + "不能为空");
        boolean supported = dictionaryDirectory.resolveActiveItems(tenantId, dictionaryCode).stream()
                .anyMatch(item -> item.code().equals(normalized));
        if (!supported) throw badRequest("DICTIONARY_VALUE_INVALID", label + "不是当前可用字典项");
        return normalized;
    }

    private String timezone(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) return null;
        try {
            return ZoneId.of(normalized).getId();
        } catch (RuntimeException exception) {
            throw badRequest("ORGANIZATION_TIMEZONE_INVALID", "时区必须使用有效的 IANA 时区编码");
        }
    }

    private void validatePeriod(LocalDate from, LocalDate to) {
        try {
            Organization.validateDates(from, to);
        } catch (IllegalArgumentException exception) {
            throw badRequest("VALIDITY_PERIOD_INVALID", "有效期结束日期不能早于开始日期");
        }
    }

    private ExecutionContext current() {
        return contextProvider.requireCurrent();
    }

    private Long actorId() {
        return current().subjectId();
    }

    private <T> T save(Action<T> action, String code, String message) {
        try {
            return action.execute();
        } catch (DataIntegrityViolationException exception) {
            throw conflict(code, message);
        }
    }

    private BusinessException hierarchyInvalid() {
        return conflict("ORGANIZATION_HIERARCHY_INVALID", "组织层级存在循环或层级过深");
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
