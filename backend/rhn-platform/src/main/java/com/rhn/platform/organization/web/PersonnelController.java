package com.rhn.platform.organization.web;

import com.rhn.platform.organization.api.PersonnelPageView;
import com.rhn.platform.organization.api.PractitionerQualificationView;
import com.rhn.platform.organization.api.StaffAssignmentView;
import com.rhn.platform.organization.application.OrganizationApplicationService;
import com.rhn.platform.organization.application.PersonnelQueryService;
import com.rhn.platform.organization.application.PractitionerQualificationService;
import com.rhn.platform.organization.domain.PersonnelStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/** Personnel management: list, qualification and department assignment without exposing employment. */
@RestController
@RequestMapping("/api/platform")
public class PersonnelController {
    private final PersonnelQueryService queries;
    private final PractitionerQualificationService qualifications;
    private final OrganizationApplicationService organizations;

    public PersonnelController(PersonnelQueryService queries, PractitionerQualificationService qualifications,
                               OrganizationApplicationService organizations) {
        this.queries = queries;
        this.qualifications = qualifications;
        this.organizations = organizations;
    }

    @GetMapping("/personnel")
    PersonnelPageView personnel(@RequestParam(required = false) String keyword,
                                @RequestParam(required = false) Long organizationId,
                                @RequestParam(required = false) Long departmentId,
                                @RequestParam(required = false) String positionType,
                                @RequestParam(required = false) String professionalTitle,
                                @RequestParam(required = false) PersonnelQueryService.PrescribingFilter prescribing,
                                @RequestParam(required = false) PersonnelStatus status,
                                @RequestParam(defaultValue = "0") int page,
                                @RequestParam(defaultValue = "20") int size) {
        return queries.page(new PersonnelQueryService.PersonnelQuery(keyword, organizationId, departmentId, positionType,
                professionalTitle, prescribing, status, page, size));
    }

    @GetMapping("/practitioners/{id}/qualification")
    PractitionerQualificationView qualification(@PathVariable Long id) {
        return qualifications.qualification(id);
    }

    @PutMapping("/practitioners/{id}/qualification")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    PractitionerQualificationView saveQualification(@PathVariable Long id,
                                                    @Valid @RequestBody PractitionerQualificationService.QualificationCommand command) {
        return qualifications.save(id, command);
    }

    public record AssignPractitionerRequest(@NotNull Long organizationId, @NotNull Long departmentId, @NotNull Long positionId,
                                            boolean primaryAssignment, @NotNull LocalDate validFrom, LocalDate validTo) {}

    @PostMapping("/practitioners/{id}/assignments")
    @PreAuthorize("hasAuthority('IAM.MANAGE')")
    @ResponseStatus(HttpStatus.CREATED)
    StaffAssignmentView assign(@PathVariable Long id, @Valid @RequestBody AssignPractitionerRequest request) {
        return organizations.assignPractitioner(id, request.organizationId(), request.departmentId(), request.positionId(),
                request.primaryAssignment(), request.validFrom(), request.validTo());
    }
}
