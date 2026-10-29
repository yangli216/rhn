package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.domain.PositionType;
import com.rhn.platform.organization.domain.Practitioner;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PractitionerRepository extends JpaRepository<Practitioner, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from Practitioner p where p.id = :id and p.tenantId = :tenantId")
    java.util.Optional<Practitioner> lockByIdAndTenantId(@org.springframework.data.repository.query.Param("id") Long id,
            @org.springframework.data.repository.query.Param("tenantId") Long tenantId);

    Optional<Practitioner> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Practitioner> findByTenantIdAndCode(Long tenantId, String code);
    List<Practitioner> findByTenantIdOrderByCode(Long tenantId);

    /**
     * 人员列表的真实数据库分页：状态、关键字、当前任职机构/科室/岗位类型与资格条件全部下沉 SQL，
     * 避免全量装载人员后在内存切片。{@code departmentIds} 无筛选时传入不存在的哨兵值。
     */
    @Query("""
            select p from Practitioner p
             where p.tenantId = :tenantId
               and (:status is null or p.status = :status)
               and (:keyword is null or lower(p.code) like :keyword or lower(p.fullName) like :keyword)
               and (:organizationId is null or exists (
                     select 1 from PersonnelAssignment a
                      where a.tenantId = :tenantId and a.status = :activeStatus
                        and a.validFrom <= :today and (a.validTo is null or a.validTo >= :today)
                        and a.organizationId = :organizationId
                        and exists (select 1 from Employment e where e.tenantId = :tenantId
                              and e.id = a.employmentId and e.practitionerId = p.id)))
               and (:departmentFilter = false or exists (
                     select 1 from PersonnelAssignment a
                      where a.tenantId = :tenantId and a.status = :activeStatus
                        and a.validFrom <= :today and (a.validTo is null or a.validTo >= :today)
                        and a.departmentId in :departmentIds
                        and exists (select 1 from Employment e where e.tenantId = :tenantId
                              and e.id = a.employmentId and e.practitionerId = p.id)))
               and (:positionType is null or exists (
                     select 1 from PersonnelAssignment a
                      where a.tenantId = :tenantId and a.status = :activeStatus
                        and a.validFrom <= :today and (a.validTo is null or a.validTo >= :today)
                        and exists (select 1 from Employment e where e.tenantId = :tenantId
                              and e.id = a.employmentId and e.practitionerId = p.id)
                        and exists (select 1 from Position pos where pos.tenantId = :tenantId
                              and pos.id = a.positionId and pos.positionType = :positionType)))
               and (:professionalTitle is null or exists (
                     select 1 from PractitionerQualification q where q.tenantId = :tenantId
                       and q.practitionerId = p.id and q.professionalTitle = :professionalTitle))
               and (:prescribing is null or
                    (:prescribing = 'UNREGISTERED' and not exists (
                        select 1 from PractitionerQualification q where q.tenantId = :tenantId and q.practitionerId = p.id))
                    or (:prescribing = 'PRESCRIBING' and exists (
                        select 1 from PractitionerQualification q where q.tenantId = :tenantId
                          and q.practitionerId = p.id and q.prescribing = true))
                    or (:prescribing = 'NARCOTIC' and exists (
                        select 1 from PractitionerQualification q where q.tenantId = :tenantId
                          and q.practitionerId = p.id and q.narcoticPrescribing = true))
                    or (:prescribing = 'ANTIMICROBIAL' and exists (
                        select 1 from PractitionerQualification q where q.tenantId = :tenantId
                          and q.practitionerId = p.id and q.antimicrobialLevel is not null))
                    or (:prescribing = 'NONE' and exists (
                        select 1 from PractitionerQualification q where q.tenantId = :tenantId
                          and q.practitionerId = p.id and q.prescribing = false)))
             order by p.code
            """)
    Page<Practitioner> findPageByFilters(@Param("tenantId") Long tenantId,
                                         @Param("status") PersonnelStatus status,
                                         @Param("keyword") String keyword,
                                         @Param("organizationId") Long organizationId,
                                         @Param("departmentFilter") boolean departmentFilter,
                                         @Param("departmentIds") Collection<Long> departmentIds,
                                         @Param("positionType") PositionType positionType,
                                         @Param("professionalTitle") String professionalTitle,
                                         @Param("prescribing") String prescribing,
                                         @Param("activeStatus") PersonnelStatus activeStatus,
                                         @Param("today") LocalDate today,
                                         Pageable pageable);
}
