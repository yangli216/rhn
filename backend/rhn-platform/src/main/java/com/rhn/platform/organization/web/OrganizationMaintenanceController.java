package com.rhn.platform.organization.web;

import com.rhn.platform.organization.api.*;
import com.rhn.platform.organization.application.*;
import com.rhn.platform.organization.domain.*;
import com.rhn.platform.organization.infrastructure.OrganizationChangeStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/platform")
public class OrganizationMaintenanceController {
    private final OrganizationImpactService impacts;
    private final OrganizationMaintenanceService maintenance;
    private final PersonnelLifecycleService personnel;
    private final OrganizationProfileMaintenanceService profiles;
    private final OrganizationApplicationService organizations;
    private final DepartmentApplicationService departments;
    private final OrganizationChangeStore changes;
    public OrganizationMaintenanceController(PersonnelLifecycleService personnel,OrganizationProfileMaintenanceService profiles,
            OrganizationApplicationService organizations,DepartmentApplicationService departments,OrganizationChangeStore changes, OrganizationImpactService impacts,OrganizationMaintenanceService maintenance) {
        this.maintenance=maintenance;this.impacts=impacts; this.personnel=personnel;this.profiles=profiles;this.organizations=organizations;this.departments=departments;this.changes=changes;
    }
    @PutMapping("/organization-units/{id}/maintenance")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    OrganizationProfileView maintainOrganization(@PathVariable Long id,@Valid @RequestBody OrganizationMaintenanceService.OrganizationMaintenanceCommand command) {
        return (OrganizationProfileView)maintenance.save(id,false,command);
    }
    @PutMapping("/departments/{id}/maintenance")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    DepartmentProfileView maintainDepartment(@PathVariable Long id,@Valid @RequestBody OrganizationMaintenanceService.OrganizationMaintenanceCommand command) {
        return (DepartmentProfileView)maintenance.save(id,true,command);
    }
    @GetMapping("/organization-units/{id}/deactivation-impact")
    OrganizationImpactService.OrganizationDeactivationImpact organizationImpact(@PathVariable Long id) { organizations.getOrganizationProfile(id); return impacts.impact(id,false); }
    @GetMapping("/departments/{id}/deactivation-impact")
    OrganizationImpactService.OrganizationDeactivationImpact departmentImpact(@PathVariable Long id) { departments.profile(id); return impacts.impact(id,true); }
    @PutMapping("/employments/{id}")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    StaffDetailView updateEmployment(@PathVariable Long id,@Valid @RequestBody EmploymentUpdate r) {
        return personnel.updateEmployment(id,r.expectedRevision(),r.sdEmploymentType(),r.primaryEmployment(),r.hireDate(),r.leaveDate(),r.sdPersonnelStatus(),r.reason());
    }
    @PostMapping("/employments/{id}/end")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    StaffDetailView endEmployment(@PathVariable Long id,@Valid @RequestBody EndRequest r) { return personnel.endEmployment(id,r.expectedRevision(),r.lastDay(),r.reason()); }
    @PutMapping("/assignments/{id}")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    StaffDetailView maintainPersonnelAssignment(@PathVariable Long id,@Valid @RequestBody AssignmentUpdate r) {
        return personnel.updateAssignment(id,r.expectedRevision(),r.positionId(),r.sdAssignmentType(),r.specialtyCode(),r.primaryAssignment(),r.workloadPercent(),r.validFrom(),r.validTo(),r.sdPersonnelStatus(),r.reason());
    }
    @PostMapping("/assignments/{id}/end")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    StaffDetailView endAssignment(@PathVariable Long id,@Valid @RequestBody EndRequest r) { return personnel.endAssignment(id,r.expectedRevision(),r.lastDay(),r.reason()); }
    @PostMapping("/assignments/{id}/transfer")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    StaffDetailView transferAssignment(@PathVariable Long id,@Valid @RequestBody TransferRequest r) { return personnel.transfer(id,r.expectedRevision(),r.departmentId(),r.positionId(),r.effectiveDate(),r.reason()); }
    @PutMapping("/positions/{id}")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    PositionView updatePosition(@PathVariable Long id,@Valid @RequestBody PositionUpdate r) { return personnel.updatePosition(id,r.expectedRevision(),r.name(),r.sdPositionType(),r.dutyDescription(),r.sdPersonnelStatus(),r.reason()); }
    @PutMapping("/organization-units/{id}/profile-items/{section}/{itemId}")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    OrganizationProfileView updateOrganizationItem(@PathVariable Long id,@PathVariable String section,@PathVariable Long itemId,
            @Valid @RequestBody OrganizationProfileMaintenanceService.ProfileItemUpdate r) { return (OrganizationProfileView) profiles.update(id,false,section,itemId,r); }
    @PutMapping("/departments/{id}/profile-items/{section}/{itemId}")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    DepartmentProfileView updateDepartmentItem(@PathVariable Long id,@PathVariable String section,@PathVariable Long itemId,
            @Valid @RequestBody OrganizationProfileMaintenanceService.ProfileItemUpdate r) { return (DepartmentProfileView) profiles.update(id,true,section,itemId,r); }
    @GetMapping("/organization-units/{id}/changes")
    List<OrganizationChangeStore.ChangeView> organizationChanges(@PathVariable Long id) { organizations.getOrganizationProfile(id);return changes.list("ORGANIZATION",id); }
    @GetMapping("/departments/{id}/changes")
    List<OrganizationChangeStore.ChangeView> departmentChanges(@PathVariable Long id) { departments.profile(id);return changes.list("DEPARTMENT",id); }
    @GetMapping("/practitioners/{id}/changes")
    List<OrganizationChangeStore.ChangeView> practitionerChanges(@PathVariable Long id) { organizations.getStaff(id);return changes.list("PRACTITIONER",id); }
    public record EndRequest(@Min(0) long expectedRevision,@NotNull LocalDate lastDay,@NotBlank @Size(max=1000) String reason) {}
    public record TransferRequest(@Min(0) long expectedRevision,@NotNull Long departmentId,@NotNull Long positionId,
            @NotNull LocalDate effectiveDate,@NotBlank @Size(max=1000) String reason) {}
    public record EmploymentUpdate(@Min(0) long expectedRevision,@NotNull EmploymentType sdEmploymentType,boolean primaryEmployment,
            @NotNull LocalDate hireDate,LocalDate leaveDate,@NotNull PersonnelStatus sdPersonnelStatus,@NotBlank @Size(max=1000) String reason) {}
    public record AssignmentUpdate(@Min(0) long expectedRevision,@NotNull Long positionId,@NotNull AssignmentType sdAssignmentType,
            @Size(max=64) String specialtyCode,boolean primaryAssignment,@DecimalMin("0") @DecimalMax("100") BigDecimal workloadPercent,
            @NotNull LocalDate validFrom,LocalDate validTo,@NotNull PersonnelStatus sdPersonnelStatus,@NotBlank @Size(max=1000) String reason) {}
    public record PositionUpdate(@Min(0) long expectedRevision,@NotBlank @Size(max=128) String name,@NotNull PositionType sdPositionType,
            @Size(max=1000) String dutyDescription,@NotNull PersonnelStatus sdPersonnelStatus,@NotBlank @Size(max=1000) String reason) {}
}
