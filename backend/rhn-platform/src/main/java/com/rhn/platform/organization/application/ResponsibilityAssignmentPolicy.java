package com.rhn.platform.organization.application;

import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.infrastructure.EmploymentRepository;
import com.rhn.platform.organization.infrastructure.PractitionerRepository;
import com.rhn.platform.organization.infrastructure.PersonnelAssignmentRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import static com.rhn.shared.api.BusinessErrors.*;

/** A responsible person references an actual assignment, rather than an unrelated personnel name. */
@Service
public class ResponsibilityAssignmentPolicy {
    private final PersonnelAssignmentRepository assignments;
    private final EmploymentRepository employments;
    private final PractitionerRepository people;
    private final ExecutionContextProvider contexts;
    private final JdbcTemplate jdbc;
    public ResponsibilityAssignmentPolicy(PersonnelAssignmentRepository assignments, EmploymentRepository employments,
            PractitionerRepository people, ExecutionContextProvider contexts, JdbcTemplate jdbc) {
        this.assignments=assignments;this.employments=employments;this.people=people;this.contexts=contexts;this.jdbc=jdbc;
    }
    public void validate(Long id,Long owner,boolean department,LocalDate from,LocalDate to,boolean active) {
        Long tenant=contexts.requireCurrent().tenantId();
        var assignment=assignments.findByIdAndTenantId(id,tenant).orElseThrow(() -> notFound("ASSIGNMENT_NOT_FOUND","负责人任职不存在"));
        if(!(department ? assignment.departmentId():assignment.organizationId()).equals(owner))
            throw badRequest("RESPONSIBILITY_ASSIGNMENT_INVALID","负责人任职不属于当前组织");
        var employment=employments.findByIdAndTenantId(assignment.employmentId(),tenant).orElseThrow();
        var person=people.findByIdAndTenantId(employment.practitionerId(),tenant).orElseThrow();
        if(active && (assignment.status()!=PersonnelStatus.ACTIVE || employment.status()!=PersonnelStatus.ACTIVE
                || person.status()!=PersonnelStatus.ACTIVE || from==null || from.isBefore(assignment.validFrom())
                || assignment.validTo()!=null && (to==null || to.isAfter(assignment.validTo()))
                || from.isBefore(employment.hireDate()) || employment.leaveDate()!=null && (to==null || to.isAfter(employment.leaveDate()))))
            throw badRequest("RESPONSIBILITY_ASSIGNMENT_INVALID","负责人须在当前组织有效任职，且负责人有效期须位于任职有效期内");
    }
    public void requirePeriod(Long assignmentId,LocalDate from,LocalDate to,boolean active) {
        Long tenant=contexts.requireCurrent().tenantId();
        for(String table:java.util.List.of("RHN_SYS_ORG_RESP","RHN_SYS_DEPT_RESP")) {
            Integer count=jdbc.queryForObject("select count(*) from "+table+" where ID_TNT=? and ID_STAFF_ASSIGN=? and SD_STATUS='ACTIVE' and "
                    + (active ? "(DA_VALID_FROM<? or (? is not null and (DA_VALID_TO is null or DA_VALID_TO>?)))":"1=1"),
                    Integer.class, active ? new Object[]{tenant,assignmentId,from,to,to}:new Object[]{tenant,assignmentId});
            if(count!=null && count>0) throw conflict("ASSIGNMENT_RESPONSIBILITY_EXISTS","该任职仍有关联负责人记录，请先在组织资料中结束或作废负责人记录后再调整任职");
        }
    }
}
