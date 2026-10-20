package com.rhn.platform.organization.application;

import com.rhn.platform.organization.api.StaffDetailView;
import com.rhn.platform.organization.api.PositionView;
import com.rhn.platform.organization.domain.*;
import com.rhn.platform.organization.infrastructure.*;
import com.rhn.shared.api.RevisionGuard;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class PersonnelLifecycleService {
    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;
    private final ResponsibilityAssignmentPolicy responsibilityPolicy;
    private final EmploymentRepository employments;
    private final PersonnelAssignmentRepository assignments;
    private final PositionRepository positions;
    private final PractitionerRepository people;
    private final OrganizationApplicationService directory;
    private final ExecutionContextProvider contexts;
    private final OrganizationChangeStore changes;
    public PersonnelLifecycleService(EmploymentRepository employments, PersonnelAssignmentRepository assignments,
            PositionRepository positions, PractitionerRepository people, OrganizationApplicationService directory,
            ExecutionContextProvider contexts, OrganizationChangeStore changes, ResponsibilityAssignmentPolicy responsibilityPolicy) {
        this.responsibilityPolicy=responsibilityPolicy;
        this.employments=employments; this.assignments=assignments; this.positions=positions; this.people=people;
        this.directory=directory; this.contexts=contexts; this.changes=changes;
    }
    @Transactional
    public StaffDetailView updateEmployment(Long id,long revision,EmploymentType type,boolean primary,
            LocalDate hire,LocalDate leave,PersonnelStatus status,String reason) {
        var value=employment(id); lockPerson(value.practitionerId()); entityManager.refresh(value);
        var before=directory.getStaff(value.practitionerId());
        period(hire,leave);
        if(status==PersonnelStatus.ACTIVE && value.status()!=PersonnelStatus.ACTIVE) requireActivePersonAndOrganization(value);
        if (primary && status==PersonnelStatus.ACTIVE && employments.findByTenantIdAndPractitionerIdOrderByHireDateDesc(tenant(),value.practitionerId()).stream()
                .anyMatch(other -> !other.id().equals(id) && other.primaryEmployment() && other.status()==PersonnelStatus.ACTIVE
                    && overlaps(hire,leave,other.hireDate(),other.leaveDate())))
            throw conflict("PRIMARY_EMPLOYMENT_OVERLAP","同一人员在重叠有效期内只能有一个主要聘用");
        var children=children(id);
        if (children.stream().anyMatch(a -> a.status()==PersonnelStatus.ACTIVE && (status==PersonnelStatus.INACTIVE
                || a.validFrom().isBefore(hire) || leave!=null && (a.validTo()==null || a.validTo().isAfter(leave)))))
            throw conflict("EMPLOYMENT_HAS_ASSIGNMENTS","请使用办理离职同时结束任职，或先调整任职有效期");
        RevisionGuard.run("EMPLOYMENT_REVISION_CONFLICT","聘用记录已变化，请刷新",() -> {
            value.update(type,primary,hire,leave,status,revision,actor()); employments.saveAndFlush(value);
        });
        return receipt(value.practitionerId(),"UPDATE_EMPLOYMENT",before,reason);
    }
    @Transactional
    public StaffDetailView endEmployment(Long id,long revision,LocalDate lastDay,String reason) {
        var value=employment(id); lockPerson(value.practitionerId()); entityManager.refresh(value);
        var before=directory.getStaff(value.practitionerId()); period(value.hireDate(),lastDay);
        if (value.status()!=PersonnelStatus.ACTIVE || value.leaveDate()!=null && lastDay.isAfter(value.leaveDate()))
            throw conflict("EMPLOYMENT_END_INVALID","聘用已作废或结束日期超过原有效期，请重新核实");
        var children=children(id);
        if(children.stream().anyMatch(a -> a.status()==PersonnelStatus.ACTIVE && a.validFrom().isAfter(lastDay)))
            throw conflict("FUTURE_ASSIGNMENT_EXISTS","离职日期之后仍有待生效任职，请先撤销该任职");
        RevisionGuard.run("EMPLOYMENT_REVISION_CONFLICT","聘用记录已变化，请刷新",() -> {
            value.update(value.employmentType(),value.primaryEmployment(),value.hireDate(),lastDay,value.status(),revision,actor());
            employments.saveAndFlush(value);
            for(var a:children) if(a.status()==PersonnelStatus.ACTIVE && (a.validTo()==null || a.validTo().isAfter(lastDay))) {
                responsibilityPolicy.requirePeriod(a.id(),a.validFrom(),lastDay,true);
                end(a,lastDay); assignments.saveAndFlush(a);
            }
        });
        return receipt(value.practitionerId(),"END_EMPLOYMENT",before,reason);
    }
    @Transactional
    public StaffDetailView updateAssignment(Long id,long revision,Long positionId,AssignmentType type,
            String specialty,boolean primary,BigDecimal workload,LocalDate from,LocalDate to,PersonnelStatus status,String reason) {
        var value=assignment(id); var employment=employment(value.employmentId()); lockPerson(employment.practitionerId()); entityManager.refresh(employment); entityManager.refresh(value);
        var before=directory.getStaff(employment.practitionerId());
        period(from,to);
        responsibilityPolicy.requirePeriod(id,from,to,status==PersonnelStatus.ACTIVE);
        if(status==PersonnelStatus.ACTIVE) {
            requireActivePersonAndOrganization(employment);
            if(employment.status()!=PersonnelStatus.ACTIVE) throw conflict("EMPLOYMENT_INACTIVE","停用聘用不能恢复任职");
            if(!"ACTIVE".equals(directory.requireDepartment(tenant(),value.organizationId(),value.departmentId()).sdOrgStatus()))
                throw conflict("ASSIGNMENT_TARGET_INACTIVE","停用科室不能恢复或延长任职");
        }
        if(from.isBefore(employment.hireDate()) || employment.leaveDate()!=null && (to==null || to.isAfter(employment.leaveDate())))
            throw badRequest("ASSIGNMENT_PERIOD_OUTSIDE_EMPLOYMENT","任职有效期必须位于聘用有效期内");
        var position=positions.findByIdAndTenantId(positionId,tenant()).orElseThrow(() -> notFound("POSITION_NOT_FOUND","岗位不存在"));
        if(status==PersonnelStatus.ACTIVE && position.status()!=PersonnelStatus.ACTIVE && !positionId.equals(value.positionId()))
            throw conflict("POSITION_INACTIVE","停用岗位不能用于新任职");
        if (workload!=null && (workload.signum()<0 || workload.compareTo(BigDecimal.valueOf(100))>0))
            throw badRequest("ASSIGNMENT_WORKLOAD_INVALID","工作量比例必须在 0 到 100 之间");
        if(primary && status==PersonnelStatus.ACTIVE && children(employment.id()).stream().anyMatch(a -> !a.id().equals(id)
                && a.departmentId().equals(value.departmentId()) && a.primaryAssignment() && a.status()==PersonnelStatus.ACTIVE
                && overlaps(from,to,a.validFrom(),a.validTo())))
            throw conflict("PRIMARY_ASSIGNMENT_OVERLAP","同一科室的重叠有效期内只能有一个主任职");
        RevisionGuard.run("ASSIGNMENT_REVISION_CONFLICT","任职记录已变化，请刷新",() -> {
            value.update(positionId,type,Strings.trimToNull(specialty),primary,workload,from,to,status,revision,actor());
            assignments.saveAndFlush(value);
        });
        return receipt(employment.practitionerId(),"UPDATE_ASSIGNMENT",before,reason);
    }
    @Transactional
    public StaffDetailView endAssignment(Long id,long revision,LocalDate lastDay,String reason) {
        var value=assignment(id); var employment=employment(value.employmentId()); lockPerson(employment.practitionerId()); entityManager.refresh(employment); entityManager.refresh(value);
        var before=directory.getStaff(employment.practitionerId()); period(value.validFrom(),lastDay);
        if(value.status()!=PersonnelStatus.ACTIVE || value.validTo()!=null && lastDay.isAfter(value.validTo()))
            throw conflict("ASSIGNMENT_END_INVALID","任职已作废或结束日期超过原有效期");
        RevisionGuard.run("ASSIGNMENT_REVISION_CONFLICT","任职记录已变化，请刷新",() -> {
            if(value.revision()!=revision) throw new com.rhn.shared.api.StaleRevisionException(value.revision(),"任职已变化，请刷新");
            responsibilityPolicy.requirePeriod(id,value.validFrom(),lastDay,true);
            end(value,lastDay); assignments.saveAndFlush(value);
        });
        return receipt(employment.practitionerId(),"END_ASSIGNMENT",before,reason);
    }
    @Transactional
    public StaffDetailView transfer(Long id,long revision,Long departmentId,Long positionId,LocalDate effectiveDate,String reason) {
        var value=assignment(id); var employment=employment(value.employmentId()); lockPerson(employment.practitionerId()); entityManager.refresh(employment); entityManager.refresh(value);
        var before=directory.getStaff(employment.practitionerId());
        if(value.status()!=PersonnelStatus.ACTIVE || !effectiveDate.isAfter(value.validFrom())
                || value.validTo()!=null && effectiveDate.isAfter(value.validTo()))
            throw badRequest("TRANSFER_DATE_INVALID","调岗日期须晚于原任职开始日，且位于原任职有效期内；录入纠错请使用编辑");
        if(value.departmentId().equals(departmentId) && value.positionId().equals(positionId))
            throw badRequest("TRANSFER_TARGET_UNCHANGED","请选择不同的科室或岗位");
        LocalDate originalEnd=value.validTo();
        RevisionGuard.run("ASSIGNMENT_REVISION_CONFLICT","任职记录已变化，请刷新",() -> {
            if(value.revision()!=revision) throw new com.rhn.shared.api.StaleRevisionException(value.revision(),"任职已变化，请刷新");
            responsibilityPolicy.requirePeriod(id,value.validFrom(),effectiveDate.minusDays(1),true);
            end(value,effectiveDate.minusDays(1)); assignments.saveAndFlush(value);
            directory.createAssignment(employment.id(),value.organizationId(),departmentId,positionId,"ASN_"+GlobalIds.next(),
                    value.assignmentType(),value.specialtyCode(),value.primaryAssignment(),value.workloadPercent(),effectiveDate,originalEnd);
        });
        return receipt(employment.practitionerId(),"TRANSFER_ASSIGNMENT",before,reason);
    }
    @Transactional
    public PositionView updatePosition(Long id,long revision,String name,PositionType type,String duty,PersonnelStatus status,String reason) {
        var value=positions.findByIdAndTenantId(id,tenant()).orElseThrow(() -> notFound("POSITION_NOT_FOUND","岗位不存在"));
        var before=directory.listPositions(tenant()).stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
        if(type!=value.positionType() && assignments.findByTenantIdOrderByValidFromDesc(tenant()).stream().anyMatch(a -> a.positionId().equals(id)))
            throw conflict("POSITION_TYPE_IN_USE","岗位已有任职引用，不能修改类别；请另建岗位并调岗");
        RevisionGuard.run("POSITION_REVISION_CONFLICT","岗位记录已变化，请刷新",() -> {
            value.update(name.trim(),type,Strings.trimToNull(duty),status,revision,actor()); positions.saveAndFlush(value);
        });
        var after=directory.listPositions(tenant()).stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
        changes.record("POSITION",id,"UPDATE_POSITION",before,after,reason); return after;
    }
    private void requireActivePersonAndOrganization(Employment value) {
        if(people.findByIdAndTenantId(value.practitionerId(),tenant()).orElseThrow().status()!=PersonnelStatus.ACTIVE)
            throw conflict("PRACTITIONER_INACTIVE","停用人员不能恢复或延长任职");
        if(!"ACTIVE".equals(directory.requireOrganization(tenant(),value.organizationId()).sdOrgStatus()))
            throw conflict("ORGANIZATION_INACTIVE","停用机构不能恢复或延长任职");
    }
    private void end(PersonnelAssignment a,LocalDate lastDay) {
        a.update(a.positionId(),a.assignmentType(),a.specialtyCode(),a.primaryAssignment(),a.workloadPercent(),
                a.validFrom(),lastDay,a.status(),a.revision(),actor());
    }
    private StaffDetailView receipt(Long person,String action,StaffDetailView before,String reason) {
        directory.synchronizeAssignments(tenant(),person);
        var after=directory.getStaff(person); changes.record("PRACTITIONER",person,action,before,after,reason); return after;
    }
    private Employment employment(Long id) { return employments.findByIdAndTenantId(id,tenant()).orElseThrow(() -> notFound("EMPLOYMENT_NOT_FOUND","聘用记录不存在")); }
    private PersonnelAssignment assignment(Long id) { return assignments.findByIdAndTenantId(id,tenant()).orElseThrow(() -> notFound("ASSIGNMENT_NOT_FOUND","任职记录不存在")); }
    private List<PersonnelAssignment> children(Long id) { return assignments.findByTenantIdAndEmploymentIdInOrderByValidFromDesc(tenant(),List.of(id)); }
    private void lockPerson(Long id) { people.lockByIdAndTenantId(id,tenant()).orElseThrow(() -> notFound("PRACTITIONER_NOT_FOUND","人员不存在")); }
    private Long tenant() { return contexts.requireCurrent().tenantId(); }
    private Long actor() { return contexts.requireCurrent().subjectId(); }
    private void period(LocalDate from,LocalDate to) { if(from==null || to!=null && to.isBefore(from)) throw badRequest("VALIDITY_PERIOD_INVALID","结束日期不能早于开始日期"); }
    private boolean overlaps(LocalDate a,LocalDate b,LocalDate c,LocalDate d) { return (b==null || !b.isBefore(c)) && (d==null || !d.isBefore(a)); }
}
