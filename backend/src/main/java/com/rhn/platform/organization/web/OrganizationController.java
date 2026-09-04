package com.rhn.platform.organization.web;

import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.DepartmentProfileView;
import com.rhn.platform.organization.api.EmploymentView;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.platform.organization.api.OrganizationProfileView;
import com.rhn.platform.organization.api.PositionView;
import com.rhn.platform.organization.api.StaffAssignmentView;
import com.rhn.platform.organization.api.StaffDetailView;
import com.rhn.platform.organization.api.StaffView;
import com.rhn.platform.organization.api.TenantView;
import com.rhn.platform.organization.application.OrganizationApplicationService;
import com.rhn.platform.organization.application.DepartmentApplicationService;
import com.rhn.platform.organization.domain.AssignmentType;
import com.rhn.platform.organization.domain.EmploymentType;
import com.rhn.platform.organization.domain.OrganizationKind;
import com.rhn.platform.organization.domain.OrganizationStatus;
import com.rhn.platform.organization.domain.OrganizationType;
import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.domain.PositionType;
import com.rhn.platform.organization.domain.PractitionerGender;
import com.rhn.platform.tenant.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/platform")
public class OrganizationController {
    private static final String CODE_PATTERN = "[A-Za-z][A-Za-z0-9_-]{0,63}";
    private final OrganizationApplicationService service;
    private final DepartmentApplicationService departmentService;

    public OrganizationController(OrganizationApplicationService service,
                                  DepartmentApplicationService departmentService) {
        this.service = service;
        this.departmentService = departmentService;
    }

    @PostMapping("/tenants")
    @ResponseStatus(HttpStatus.CREATED)
    TenantView createTenant(@Valid @RequestBody CreateTenantRequest request) {
        return service.createTenant(tenantId(), request.code().trim(), request.name().trim());
    }

    @GetMapping("/organization-units")
    List<OrganizationView> organizationUnits() {
        return java.util.stream.Stream.concat(
                service.listOrganizationUnits(tenantId()).stream(),
                departmentService.compatibilityNodes(tenantId()).stream()).toList();
    }

    @PostMapping("/organization-units")
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationView createOrganizationUnit(@Valid @RequestBody CreateOrganizationUnitRequest request) {
        if (request.sdOrgKind() == OrganizationKind.ORG_UNIT) {
            Long organizationId = request.organizationId() != null ? request.organizationId()
                    : requireDepartmentOrganization(request.parentId());
            Long departmentParentId = request.parentId() != null
                    && departmentService.exists(tenantId(), request.parentId()) ? request.parentId() : null;
            DepartmentView created = departmentService.create(tenantId(), organizationId, departmentParentId,
                    request.code(), request.name(), request.shortName(), request.description(),
                    request.sdDepartmentType(), departmentProperty(request.sdDepartmentProperty(), request.sdOrgType()),
                    Boolean.TRUE.equals(request.virtual()), defaultSort(request.sortOrder()),
                    request.validFrom(), request.validTo());
            return departmentService.compatibilityView(created);
        }
        return service.createOrganization(tenantId(), request.parentId(), request.code(), request.name(),
                request.shortName(), request.description(), request.sdOrgKind(), request.sdOrgType(),
                request.sdOrgProperty(), Boolean.TRUE.equals(request.virtual()), defaultSort(request.sortOrder()), request.timezoneCode(),
                request.sdDepartmentType(), request.validFrom(), request.validTo());
    }

    @GetMapping("/organization-units/{id}")
    OrganizationProfileView organizationProfile(@PathVariable Long id) {
        return service.getOrganizationProfile(id);
    }

    @PutMapping("/organization-units/{id}")
    OrganizationView updateOrganizationUnit(@PathVariable Long id,
                                            @Valid @RequestBody UpdateOrganizationUnitRequest request) {
        if (departmentService.exists(tenantId(), id)) {
            DepartmentView updated = departmentService.update(id, request.expectedRevision(), request.parentId(),
                    request.name(), request.shortName(), request.description(), request.sdDepartmentType(),
                    departmentProperty(request.sdDepartmentProperty(), request.sdOrgType()),
                    Boolean.TRUE.equals(request.virtual()), defaultSort(request.sortOrder()),
                    request.validFrom(), request.validTo());
            return departmentService.compatibilityView(updated);
        }
        return service.updateOrganization(id, request.expectedRevision(), request.parentId(), request.name(),
                request.shortName(), request.description(), request.sdOrgType(), request.sdOrgProperty(),
                Boolean.TRUE.equals(request.virtual()), defaultSort(request.sortOrder()), request.timezoneCode(), request.sdDepartmentType(),
                request.validFrom(), request.validTo());
    }

    @PostMapping("/organization-units/{id}/status")
    OrganizationView changeOrganizationStatus(@PathVariable Long id,
                                              @Valid @RequestBody OrganizationStatusRequest request) {
        if (departmentService.exists(tenantId(), id)) {
            return departmentService.compatibilityView(departmentService.changeStatus(
                    id, request.expectedRevision(), request.sdOrgStatus()));
        }
        return service.changeOrganizationStatus(id, request.expectedRevision(), request.sdOrgStatus());
    }

    @GetMapping("/organizations")
    List<OrganizationView> organizations() {
        return service.listOrganizations(tenantId());
    }

    @PostMapping("/organizations")
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationView createOrganization(@Valid @RequestBody LegacyOrganizationRequest request) {
        return service.createOrganization(tenantId(), request.parentId(), request.code(), request.name(),
                null, null, OrganizationKind.LEGAL_ORGANIZATION, request.type(), null, false, 0,
                null, null, request.validFrom(), request.validTo());
    }

    @GetMapping("/departments")
    List<DepartmentView> departments(@RequestParam Long organizationId) {
        return service.listDepartments(tenantId(), organizationId);
    }

    @PostMapping("/departments")
    @ResponseStatus(HttpStatus.CREATED)
    DepartmentView createDepartment(@Valid @RequestBody LegacyDepartmentRequest request) {
        return departmentService.create(tenantId(), request.organizationId(), request.parentId(),
                request.code(), request.name(), request.shortName(), request.description(),
                request.sdDepartmentType() == null ? "CUSTOM_OTHER" : request.sdDepartmentType(),
                request.sdDepartmentProperty() == null ? legacyDepartmentProperty(request.type())
                        : request.sdDepartmentProperty(),
                Boolean.TRUE.equals(request.virtual()), defaultSort(request.sortOrder()),
                request.validFrom(), request.validTo());
    }

    @GetMapping("/departments/{id}")
    DepartmentProfileView departmentProfile(@PathVariable Long id) {
        return departmentService.profile(id);
    }

    @PostMapping("/organization-units/{id}/identifiers")
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationProfileView addIdentifier(@PathVariable Long id,
                                          @Valid @RequestBody CreateIdentifierRequest request) {
        return service.addIdentifier(id, request.identifierSystem(), request.identifierCode(),
                request.sdIdentifierType(), request.issuerOrganizationId(), request.primaryIdentifier(),
                request.validFrom(), request.validTo(), request.sdVerifyStatus());
    }

    @PostMapping("/organization-units/{id}/contacts")
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationProfileView addContact(@PathVariable Long id,
                                       @Valid @RequestBody CreateContactRequest request) {
        if (departmentService.exists(tenantId(), id)) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "请使用科室联系方式接口");
        }
        return service.addContact(id, request.sdContactType(), request.contactValue(), request.sdContactUse(),
                request.primaryContact(), request.sortOrder(), request.validFrom(), request.validTo());
    }

    @PostMapping("/organization-units/{id}/addresses")
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationProfileView addAddress(@PathVariable Long id,
                                       @Valid @RequestBody CreateAddressRequest request) {
        return service.addAddress(id, request.sdAddressType(), request.countryCode(), request.provinceCode(),
                request.cityCode(), request.districtCode(), request.streetAddress(), request.postalCode(),
                request.validFrom(), request.validTo());
    }

    @PostMapping("/organization-units/{id}/relations")
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationProfileView addRelation(@PathVariable Long id,
                                        @Valid @RequestBody CreateRelationRequest request) {
        return service.addRelation(id, request.targetOrganizationId(), request.sdRelationType(),
                request.primaryRelation(), request.description(), request.validFrom(), request.validTo());
    }

    @PostMapping("/organization-units/{id}/capabilities")
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationProfileView addCapability(@PathVariable Long id,
                                          @Valid @RequestBody CreateCapabilityRequest request) {
        return service.addCapability(id, request.sdCapabilityType(), request.qualificationBasisCode(),
                request.capabilityScope(), request.validFrom(), request.validTo(), request.sdVerifyStatus());
    }

    @PostMapping("/organization-units/{id}/responsibilities")
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationProfileView addResponsibility(@PathVariable Long id,
                                              @Valid @RequestBody CreateResponsibilityRequest request) {
        return service.addResponsibility(id, request.assignmentId(), request.externalResponsibleName(),
                request.sdResponsibilityType(), request.primaryResponsibility(),
                request.validFrom(), request.validTo());
    }

    @PostMapping("/departments/{id}/contacts")
    @ResponseStatus(HttpStatus.CREATED)
    DepartmentProfileView addDepartmentContact(@PathVariable Long id,
                                                @Valid @RequestBody CreateContactRequest request) {
        return departmentService.addContact(id, request.sdContactType(), request.contactValue(),
                request.sdContactUse(), request.primaryContact(), request.sortOrder(),
                request.validFrom(), request.validTo());
    }

    @PostMapping("/departments/{id}/relations")
    @ResponseStatus(HttpStatus.CREATED)
    DepartmentProfileView addDepartmentRelation(@PathVariable Long id,
                                                 @Valid @RequestBody CreateDepartmentRelationRequest request) {
        return departmentService.addRelation(id, request.targetDepartmentId(), request.sdRelationType(),
                request.primaryRelation(), request.description(), request.validFrom(), request.validTo());
    }

    @PostMapping("/departments/{id}/capabilities")
    @ResponseStatus(HttpStatus.CREATED)
    DepartmentProfileView addDepartmentCapability(@PathVariable Long id,
                                                   @Valid @RequestBody CreateCapabilityRequest request) {
        return departmentService.addCapability(id, request.sdCapabilityType(), request.qualificationBasisCode(),
                request.capabilityScope(), request.validFrom(), request.validTo(), request.sdVerifyStatus());
    }

    @PostMapping("/departments/{id}/responsibilities")
    @ResponseStatus(HttpStatus.CREATED)
    DepartmentProfileView addDepartmentResponsibility(@PathVariable Long id,
                                                       @Valid @RequestBody CreateResponsibilityRequest request) {
        return departmentService.addResponsibility(id, request.assignmentId(), request.externalResponsibleName(),
                request.sdResponsibilityType(), request.primaryResponsibility(),
                request.validFrom(), request.validTo());
    }

    @GetMapping({"/practitioners", "/staff"})
    List<StaffView> staff() {
        return service.listStaff(tenantId());
    }

    @GetMapping("/practitioners/{id}")
    StaffDetailView staffDetail(@PathVariable Long id) {
        return service.getStaff(id);
    }

    @PostMapping({"/practitioners", "/staff"})
    @ResponseStatus(HttpStatus.CREATED)
    StaffView createStaff(@Valid @RequestBody CreateStaffRequest request) {
        return service.createStaff(tenantId(), request.code(), request.fullName(), request.sdPractGender());
    }

    @PutMapping("/practitioners/{id}")
    StaffView updateStaff(@PathVariable Long id, @Valid @RequestBody UpdateStaffRequest request) {
        return service.updateStaff(id, request.expectedRevision(), request.fullName(), request.sdPractGender());
    }

    @PostMapping("/practitioners/{id}/status")
    StaffView changeStaffStatus(@PathVariable Long id, @Valid @RequestBody StaffStatusRequest request) {
        return service.changeStaffStatus(id, request.expectedRevision(), request.sdPersonnelStatus());
    }

    @GetMapping("/positions")
    List<PositionView> positions() {
        return service.listPositions(tenantId());
    }

    @PostMapping("/positions")
    @ResponseStatus(HttpStatus.CREATED)
    PositionView createPosition(@Valid @RequestBody CreatePositionRequest request) {
        return service.createPosition(request.code(), request.name(), request.sdPositionType(),
                request.dutyDescription());
    }

    @PostMapping("/employments")
    @ResponseStatus(HttpStatus.CREATED)
    EmploymentView createEmployment(@Valid @RequestBody CreateEmploymentRequest request) {
        return service.createEmployment(request.practitionerId(), request.organizationId(), request.code(),
                request.sdEmploymentType(), request.primaryEmployment(), request.hireDate(), request.leaveDate());
    }

    @PostMapping("/assignments")
    @ResponseStatus(HttpStatus.CREATED)
    StaffAssignmentView createAssignment(@Valid @RequestBody CreateAssignmentRequest request) {
        return service.createAssignment(request.employmentId(), request.organizationId(), request.departmentId(),
                request.positionId(),
                request.code(), request.sdAssignmentType(), request.specialtyCode(), request.primaryAssignment(),
                request.workloadPercent(), request.validFrom(), request.validTo());
    }

    @GetMapping("/assignments")
    List<StaffAssignmentView> listAssignments(@RequestParam(required = false) Long organizationId,
                                              @RequestParam(required = false) Long departmentId) {
        return service.listAssignments(tenantId(), organizationId, departmentId);
    }

    private Long tenantId() {
        return TenantContext.requireTenantId();
    }

    private int defaultSort(Integer value) {
        return value == null ? 0 : value;
    }

    private Long requireDepartmentOrganization(Long parentId) {
        if (parentId == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "新建科室必须指定所属机构或上级科室");
        }
        return departmentService.resolveOrganizationId(tenantId(), parentId);
    }

    private String departmentProperty(String explicit, OrganizationType structuralType) {
        if (explicit != null && !explicit.isBlank()) return explicit;
        return switch (structuralType) {
            case ADMINISTRATIVE_DEPARTMENT -> "ADMINISTRATIVE";
            case MEDICAL_TECHNOLOGY_DEPARTMENT -> "MEDICAL_TECHNOLOGY";
            case NURSING_UNIT -> "NURSING";
            default -> "CLINICAL";
        };
    }

    private String legacyDepartmentProperty(String value) {
        if (value == null || value.isBlank()) return "CLINICAL";
        return switch (value.trim().toUpperCase(java.util.Locale.ROOT)) {
            case "ADMINISTRATIVE" -> "ADMINISTRATIVE";
            case "MEDICAL_TECHNOLOGY" -> "MEDICAL_TECHNOLOGY";
            case "NURSING" -> "NURSING";
            default -> "CLINICAL";
        };
    }

    record CreateTenantRequest(@NotBlank @Size(max = 64) String code,
                               @NotBlank @Size(max = 200) String name) {}

    record CreateOrganizationUnitRequest(
            Long organizationId,
            Long parentId,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 100) String shortName,
            @Size(max = 1000) String description,
            @NotNull OrganizationKind sdOrgKind,
            @NotNull OrganizationType sdOrgType,
            @Size(max = 32) String sdOrgProperty,
            @Size(max = 32) String sdDepartmentProperty,
            Boolean virtual,
            @Min(0) Integer sortOrder,
            @Size(max = 64) String timezoneCode,
            @Size(max = 128) String sdDepartmentType,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}

    record UpdateOrganizationUnitRequest(
            @Min(0) long expectedRevision,
            Long parentId,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 100) String shortName,
            @Size(max = 1000) String description,
            @NotNull OrganizationType sdOrgType,
            @Size(max = 32) String sdOrgProperty,
            @Size(max = 32) String sdDepartmentProperty,
            Boolean virtual,
            @Min(0) Integer sortOrder,
            @Size(max = 64) String timezoneCode,
            @Size(max = 128) String sdDepartmentType,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}

    record CreateIdentifierRequest(
            @NotBlank @Size(max = 300) String identifierSystem,
            @NotBlank @Size(max = 128) String identifierCode,
            @NotBlank @Size(max = 64) String sdIdentifierType,
            Long issuerOrganizationId,
            boolean primaryIdentifier,
            @NotNull LocalDate validFrom,
            LocalDate validTo,
            @NotBlank @Size(max = 32) String sdVerifyStatus) {}

    record CreateContactRequest(
            @NotBlank @Size(max = 32) String sdContactType,
            @NotBlank @Size(max = 300) String contactValue,
            @NotBlank @Size(max = 32) String sdContactUse,
            boolean primaryContact,
            @Min(0) int sortOrder,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}

    record CreateAddressRequest(
            @NotBlank @Size(max = 32) String sdAddressType,
            @NotBlank @Size(max = 32) String countryCode,
            @Size(max = 32) String provinceCode,
            @Size(max = 32) String cityCode,
            @Size(max = 32) String districtCode,
            @NotBlank @Size(max = 500) String streetAddress,
            @Size(max = 32) String postalCode,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}

    record CreateRelationRequest(
            @NotNull Long targetOrganizationId,
            @NotBlank @Size(max = 32) String sdRelationType,
            boolean primaryRelation,
            @Size(max = 500) String description,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}

    record CreateDepartmentRelationRequest(
            @NotNull Long targetDepartmentId,
            @NotBlank @Size(max = 32) String sdRelationType,
            boolean primaryRelation,
            @Size(max = 500) String description,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}

    record CreateCapabilityRequest(
            @NotBlank @Size(max = 64) String sdCapabilityType,
            @Size(max = 128) String qualificationBasisCode,
            @Size(max = 1000) String capabilityScope,
            @NotNull LocalDate validFrom,
            LocalDate validTo,
            @NotBlank @Size(max = 32) String sdVerifyStatus) {}

    record CreateResponsibilityRequest(
            Long assignmentId,
            @Size(max = 100) String externalResponsibleName,
            @NotBlank @Size(max = 32) String sdResponsibilityType,
            boolean primaryResponsibility,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}

    record OrganizationStatusRequest(
            @Min(0) long expectedRevision,
            @NotNull OrganizationStatus sdOrgStatus) {}

    record LegacyOrganizationRequest(
            Long parentId,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 200) String name,
            @NotNull OrganizationType type,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}

    record LegacyDepartmentRequest(
            @NotNull Long organizationId,
            Long parentId,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 100) String shortName,
            @Size(max = 1000) String description,
            @Size(max = 64) String type,
            @Size(max = 128) String sdDepartmentType,
            @Size(max = 32) String sdDepartmentProperty,
            Boolean virtual,
            @Min(0) Integer sortOrder,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}

    record CreateStaffRequest(
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 100) String fullName,
            @NotNull PractitionerGender sdPractGender,
            @Size(max = 100) String practitionerIdentifier) {}

    record UpdateStaffRequest(
            @Min(0) long expectedRevision,
            @NotBlank @Size(max = 100) String fullName,
            @NotNull PractitionerGender sdPractGender) {}

    record StaffStatusRequest(
            @Min(0) long expectedRevision,
            @NotNull PersonnelStatus sdPersonnelStatus) {}

    record CreatePositionRequest(
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotBlank @Size(max = 128) String name,
            @NotNull PositionType sdPositionType,
            @Size(max = 1000) String dutyDescription) {}

    record CreateEmploymentRequest(
            @NotNull Long practitionerId,
            @NotNull Long organizationId,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotNull EmploymentType sdEmploymentType,
            boolean primaryEmployment,
            @NotNull LocalDate hireDate,
            LocalDate leaveDate) {}

    record CreateAssignmentRequest(
            @NotNull Long employmentId,
            @NotNull Long organizationId,
            @NotNull Long departmentId,
            @NotNull Long positionId,
            @NotBlank @Pattern(regexp = CODE_PATTERN) String code,
            @NotNull AssignmentType sdAssignmentType,
            @Size(max = 64) String specialtyCode,
            boolean primaryAssignment,
            @DecimalMin("0") @DecimalMax("100") BigDecimal workloadPercent,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {}
}
