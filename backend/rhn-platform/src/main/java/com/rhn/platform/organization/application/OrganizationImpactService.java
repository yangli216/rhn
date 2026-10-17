package com.rhn.platform.organization.application;

import com.rhn.platform.organization.domain.*;
import com.rhn.platform.organization.infrastructure.*;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class OrganizationImpactService {
    private final OrganizationRepository organizations;
    private final DepartmentRepository departments;
    private final PersonnelAssignmentRepository assignments;
    private final EmploymentRepository employments;
    private final ExecutionContextProvider contexts;
    public OrganizationImpactService(OrganizationRepository organizations,DepartmentRepository departments,
            PersonnelAssignmentRepository assignments,ExecutionContextProvider contexts, EmploymentRepository employments) {
        this.employments=employments;this.organizations=organizations;this.departments=departments;this.assignments=assignments;this.contexts=contexts;
    }
    public record OrganizationDeactivationImpact(int activeChildren,int continuingAssignments,int continuingEmployments) { public boolean canDeactivate() { return activeChildren==0 && continuingAssignments==0 && continuingEmployments==0; } }
    public OrganizationDeactivationImpact impact(Long id,boolean department) {
        Long tenant=contexts.requireCurrent().tenantId();LocalDate today=LocalDate.now();
        long children=department ? departments.findByTenantIdOrderByOrganizationIdAscSortOrderAscCodeAsc(tenant).stream()
            .filter(d -> id.equals(d.parentId()) && d.status()==OrganizationStatus.ACTIVE).count()
            : organizations.findByTenantIdOrderBySortOrderAscCodeAsc(tenant).stream().filter(o -> id.equals(o.parentId()) && o.status()==OrganizationStatus.ACTIVE).count()
                + departments.findByTenantIdAndOrganizationIdOrderBySortOrderAscCodeAsc(tenant,id).stream().filter(d -> d.status()==OrganizationStatus.ACTIVE).count();
        var rows=department ? assignments.findByTenantIdAndDepartmentIdOrderByValidFromDesc(tenant,id):assignments.findByTenantIdAndOrganizationIdOrderByValidFromDesc(tenant,id);
        long continuing=rows.stream().filter(a -> a.status()==PersonnelStatus.ACTIVE && (a.validTo()==null || !a.validTo().isBefore(today))).count();
        long hired=department ? 0:employments.findByTenantId(tenant).stream().filter(e -> e.organizationId().equals(id) && e.status()==PersonnelStatus.ACTIVE && (e.leaveDate()==null || !e.leaveDate().isBefore(today))).count();
        return new OrganizationDeactivationImpact(Math.toIntExact(children),Math.toIntExact(continuing),Math.toIntExact(hired));
    }
    public void requireDeactivationReady(Long id,boolean department) {
        var impact=impact(id,department);
        if(!impact.canDeactivate()) throw conflict("ORGANIZATION_DEACTIVATION_BLOCKED","仍有 "+impact.activeChildren()+" 个启用下级、"+impact.continuingAssignments()+" 条未结束或待生效任职、"+impact.continuingEmployments()+" 条未结束聘用；请先处理后停用");
    }
}
