package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.ValueSetMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ValueSetMemberRepository extends JpaRepository<ValueSetMember, Long> {
    @Query("select c from Concept c join ValueSetMember m on m.conceptId = c.id " +
            "where m.valueSetId = :valueSetId order by m.sortOrder, c.code")
    List<com.rhn.platform.terminology.domain.Concept> findConcepts(@Param("valueSetId") Long valueSetId);
}

