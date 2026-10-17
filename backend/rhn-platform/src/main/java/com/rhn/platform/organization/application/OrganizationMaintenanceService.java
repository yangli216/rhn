package com.rhn.platform.organization.application;

import com.rhn.platform.organization.api.DepartmentProfileView;
import com.rhn.platform.organization.api.OrganizationProfileView;
import com.rhn.platform.organization.domain.OrganizationType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/** One form is one transaction, including the parent revision and all changed detail rows. */
@Service
public class OrganizationMaintenanceService {
    private final OrganizationApplicationService organizations;
    private final DepartmentApplicationService departments;
    private final OrganizationProfileMaintenanceService profiles;
    private final com.rhn.platform.organization.infrastructure.OrganizationChangeStore changes;
    public OrganizationMaintenanceService(OrganizationApplicationService organizations,DepartmentApplicationService departments,
            OrganizationProfileMaintenanceService profiles,com.rhn.platform.organization.infrastructure.OrganizationChangeStore changes) {
        this.organizations=organizations;this.departments=departments;this.profiles=profiles;this.changes=changes;
    }
    public record OrganizationMaintenanceCommand(@Min(0) long expectedRevision,@NotNull @Valid UnitDetails details,
            @NotNull @Size(max=500) List<@NotNull @Valid ProfileChange> changes,@NotBlank @Size(max=1000) String reason) {}
    public record UnitDetails(Long parentId,@NotBlank @Size(max=200) String name,@Size(max=100) String shortName,
            @Size(max=1000) String description,@NotNull OrganizationType sdOrgType,@Size(max=32) String sdOrgProperty,
            @Size(max=32) String sdDepartmentProperty,boolean virtual,@Min(0) int sortOrder,@Size(max=64) String timezoneCode,
            @Size(max=128) String sdDepartmentType,@NotNull LocalDate validFrom,LocalDate validTo) {}
    public record ProfileChange(@NotBlank String section,Long id,
            @NotNull @Valid OrganizationProfileMaintenanceService.ProfileItemUpdate values) {}

    @Transactional
    public Object save(Long id,boolean department,OrganizationMaintenanceCommand command) {
        Object before=department ? departments.profile(id):organizations.getOrganizationProfile(id);
        var seen=new HashSet<String>();
        for(var change:command.changes()) if(change.id()!=null && !seen.add(change.section()+":"+change.id()))
            throw badRequest("PROFILE_ITEM_REPEATED","同一资料记录不能重复提交");
        var d=command.details();
        long revision;
        if(department) revision=departments.update(id,command.expectedRevision(),d.parentId(),d.name(),d.shortName(),d.description(),
            d.sdDepartmentType(),d.sdDepartmentProperty(),d.virtual(),d.sortOrder(),d.validFrom(),d.validTo()).revision();
        else revision=organizations.updateOrganization(id,command.expectedRevision(),d.parentId(),d.name(),d.shortName(),d.description(),
            d.sdOrgType(),d.sdOrgProperty(),d.virtual(),d.sortOrder(),d.timezoneCode(),d.sdDepartmentType(),d.validFrom(),d.validTo()).revision();
        Object result=department ? departments.profile(id):organizations.getOrganizationProfile(id);
        for(var change:command.changes()) {
            result=profiles.maintain(id,department,change.section(),change.id(),change.values(),revision,command.reason());
            revision=result instanceof DepartmentProfileView p ? p.department().revision():((OrganizationProfileView)result).organization().revision();
        }
        changes.record(department ? "DEPARTMENT":"ORGANIZATION",id,"MAINTAIN_ORGANIZATION",before,result,command.reason());
        return result;
    }
}
