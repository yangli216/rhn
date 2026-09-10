package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.Concept;
import com.rhn.platform.terminology.domain.TerminologyStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface ConceptRepository extends JpaRepository<Concept, Long> {
    Optional<Concept> findByCodeSystemIdAndCode(Long codeSystemId, String code);
    List<Concept> findByCodeSystemIdAndStatusAndEffectiveFromLessThanEqualOrderByCode(
            Long codeSystemId, TerminologyStatus status, LocalDate atDate);
    List<Concept> findByCodeSystemIdInOrderByDisplay(Collection<Long> codeSystemIds);

    @Query("""
            select c from Concept c where c.codeSystemId in :systemIds and c.status = :activeStatus
              and c.effectiveFrom <= :date and (c.effectiveTo is null or c.effectiveTo >= :date)
              and (c.display = :name or c.shortDisplay = :name
                or exists (select a.id from ConceptAlias a where a.conceptId = c.id
                  and a.status = :activeStatus and a.aliasName = :name))
            """)
    List<Concept> findExactDiseaseNames(@Param("systemIds") Collection<Long> systemIds,
            @Param("name") String name, @Param("activeStatus") TerminologyStatus activeStatus, @Param("date") LocalDate date);

    @Query("""
            select c from Concept c
            where c.codeSystemId in :systemIds
              and (:conceptType is null or :conceptType = '' or c.conceptType = :conceptType)
              and (:status is null or c.status = :status)
              and (:query is null or :query = '' or lower(c.code) like lower(concat('%', :query, '%'))
                   or lower(c.display) like lower(concat('%', :query, '%'))
                   or lower(coalesce(c.shortDisplay, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(c.searchCode, '')) like lower(concat('%', :query, '%'))
                   or exists (select a.id from ConceptAlias a where a.conceptId = c.id and a.status = :activeStatus
                       and (lower(a.aliasName) like lower(concat('%', :query, '%'))
                            or lower(coalesce(a.searchCode, '')) like lower(concat('%', :query, '%')))))
            """)
    Page<Concept> searchDiseases(@Param("systemIds") Collection<Long> systemIds,
                                 @Param("query") String query,
                                 @Param("conceptType") String conceptType,
                                 @Param("status") TerminologyStatus status,
                                 @Param("activeStatus") TerminologyStatus activeStatus,
                                 Pageable pageable);
}
