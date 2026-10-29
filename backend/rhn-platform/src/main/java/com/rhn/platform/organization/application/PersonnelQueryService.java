package com.rhn.platform.organization.application;

import com.rhn.platform.organization.api.PersonnelPageView;
import com.rhn.platform.organization.api.PersonnelRowView;
import com.rhn.platform.organization.domain.Department;
import com.rhn.platform.organization.domain.Employment;
import com.rhn.platform.organization.domain.Organization;
import com.rhn.platform.organization.domain.PersonnelAssignment;
import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.domain.Position;
import com.rhn.platform.organization.domain.PositionType;
import com.rhn.platform.organization.domain.Practitioner;
import com.rhn.platform.organization.domain.PractitionerQualification;
import com.rhn.platform.organization.infrastructure.*;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;

/**
 * Server-side personnel list. Joins in memory per tenant: staff counts of primary-care tenants are in the
 * hundreds, and this keeps "current assignment" and qualification filters in one place instead of in the browser.
 */
@Service
public class PersonnelQueryService {
    public enum PrescribingFilter { PRESCRIBING, NARCOTIC, ANTIMICROBIAL, NONE, UNREGISTERED }

    public record PersonnelQuery(String keyword, Long organizationId, Long departmentId, String positionType,
                                 String professionalTitle, PrescribingFilter prescribing, PersonnelStatus status,
                                 int page, int size) {}

    private final PractitionerRepository people;
    private final EmploymentRepository employments;
    private final PersonnelAssignmentRepository assignments;
    private final PositionRepository positions;
    private final OrganizationRepository organizations;
    private final DepartmentRepository departments;
    private final PractitionerQualificationRepository qualifications;
    private final ExecutionContextProvider contexts;

    public PersonnelQueryService(PractitionerRepository people, EmploymentRepository employments,
                                 PersonnelAssignmentRepository assignments, PositionRepository positions,
                                 OrganizationRepository organizations, DepartmentRepository departments,
                                 PractitionerQualificationRepository qualifications, ExecutionContextProvider contexts) {
        this.people = people;
        this.employments = employments;
        this.assignments = assignments;
        this.positions = positions;
        this.organizations = organizations;
        this.departments = departments;
        this.qualifications = qualifications;
        this.contexts = contexts;
    }

    @Transactional(readOnly = true)
    public PersonnelPageView page(PersonnelQuery query) {
        if (query.page() < 0 || query.size() < 1 || query.size() > 200) throw badRequest("PAGE_INVALID", "分页参数无效");
        Long tenantId = contexts.requireCurrent().tenantId();
        LocalDate today = LocalDate.now();
        List<Department> allDepartments = departments.findByTenantIdOrderByOrganizationIdAscSortOrderAscCodeAsc(tenantId);
        Map<Long, String> departmentNames = allDepartments.stream().collect(Collectors.toMap(Department::id, Department::name));
        Set<Long> departmentScope = query.departmentId() == null ? null : descendants(query.departmentId(), allDepartments);
        String keyword = Optional.ofNullable(Strings.trimToNull(query.keyword())).map(value -> value.toLowerCase(Locale.ROOT)).orElse(null);
        PositionType positionType = null;
        if (query.positionType() != null) {
            try { positionType = PositionType.valueOf(query.positionType()); }
            catch (IllegalArgumentException invalid) {
                return new PersonnelPageView(List.of(), query.page(), query.size(), 0, 0, query.page() == 0, true);
            }
        }
        Page<Practitioner> page = people.findPageByFilters(tenantId, query.status(),
                keyword == null ? null : "%" + keyword + "%", query.organizationId(),
                departmentScope != null, departmentScope == null ? List.of(-1L) : departmentScope, positionType,
                query.professionalTitle(), query.prescribing() == null ? null : query.prescribing().name(),
                PersonnelStatus.ACTIVE, today, PageRequest.of(query.page(), query.size()));
        List<Practitioner> persons = page.getContent();
        Map<Long, String> organizationNames = organizations.findByTenantIdOrderBySortOrderAscCodeAsc(tenantId).stream()
                .collect(Collectors.toMap(Organization::id, Organization::name));
        List<Long> personIds = persons.stream().map(Practitioner::id).toList();
        Map<Long, List<PersonnelAssignment>> currentByPerson = new HashMap<>();
        if (!personIds.isEmpty()) {
            Map<Long, Employment> employmentById = employments.findByTenantIdAndPractitionerIdIn(tenantId, personIds)
                    .stream().collect(Collectors.toMap(Employment::id, Function.identity()));
            List<Long> employmentIds = employmentById.values().stream().map(Employment::id).toList();
            if (!employmentIds.isEmpty()) {
                for (PersonnelAssignment assignment : assignments
                        .findByTenantIdAndEmploymentIdInOrderByValidFromDesc(tenantId, employmentIds)) {
                    Employment employment = employmentById.get(assignment.employmentId());
                    if (employment == null || !current(assignment, today)) continue;
                    currentByPerson.computeIfAbsent(employment.practitionerId(), id -> new ArrayList<>()).add(assignment);
                }
            }
        }
        Set<Long> positionIds = currentByPerson.values().stream().flatMap(List::stream)
                .map(PersonnelAssignment::positionId).collect(Collectors.toSet());
        Map<Long, Position> positionById = positionIds.isEmpty() ? Map.of()
                : positions.findByTenantIdAndIdIn(tenantId, positionIds).stream()
                        .collect(Collectors.toMap(Position::id, Function.identity()));
        Map<Long, PractitionerQualification> qualificationByPerson = personIds.isEmpty() ? Map.of()
                : qualifications.findByTenantIdAndPractitionerIdIn(tenantId, personIds).stream()
                        .collect(Collectors.toMap(PractitionerQualification::practitionerId, Function.identity()));
        List<PersonnelRowView> rows = persons.stream()
                .map(person -> row(person, currentByPerson.getOrDefault(person.id(), List.of()),
                        qualificationByPerson.get(person.id()), positionById, organizationNames, departmentNames))
                .toList();
        int totalPages = page.getTotalPages();
        return new PersonnelPageView(rows, query.page(), query.size(), page.getTotalElements(), totalPages,
                query.page() == 0, query.page() >= totalPages - 1);
    }

    private static boolean current(PersonnelAssignment assignment, LocalDate today) {
        return assignment.status() == PersonnelStatus.ACTIVE && !assignment.validFrom().isAfter(today)
                && (assignment.validTo() == null || !assignment.validTo().isBefore(today));
    }

    private static Set<Long> descendants(Long rootId, List<Department> all) {
        Map<Long, List<Long>> children = all.stream().filter(item -> item.parentId() != null)
                .collect(Collectors.groupingBy(Department::parentId, Collectors.mapping(Department::id, Collectors.toList())));
        Set<Long> result = new HashSet<>();
        Deque<Long> pending = new ArrayDeque<>(List.of(rootId));
        while (!pending.isEmpty()) {
            Long id = pending.pop();
            if (result.add(id)) pending.addAll(children.getOrDefault(id, List.of()));
        }
        return result;
    }

    private static PersonnelRowView row(Practitioner person, List<PersonnelAssignment> held, PractitionerQualification qualification,
                                        Map<Long, Position> positionById, Map<Long, String> organizationNames,
                                        Map<Long, String> departmentNames) {
        PersonnelRowView.PrimaryAssignment primary = held.stream()
                .sorted(Comparator.comparing((PersonnelAssignment item) -> !item.primaryAssignment()).thenComparing(PersonnelAssignment::validFrom))
                .findFirst().map(item -> {
                    Position position = positionById.get(item.positionId());
                    return new PersonnelRowView.PrimaryAssignment(item.id(), item.organizationId(), organizationNames.get(item.organizationId()),
                            item.departmentId(), departmentNames.get(item.departmentId()), item.positionId(),
                            position == null ? null : position.name(), position == null ? null : position.positionType().name());
                }).orElse(null);
        return new PersonnelRowView(person.id(), person.revision(), person.code(), person.fullName(),
                person.gender() == null ? null : person.gender().code(), person.status().name(), primary, held.size(),
                qualification != null, qualification == null ? null : qualification.professionalTitle(),
                qualification == null ? null : qualification.practiceCategory(),
                qualification != null && qualification.prescribing(), qualification != null && qualification.narcoticPrescribing(),
                qualification == null ? null : qualification.antimicrobialLevel());
    }
}
