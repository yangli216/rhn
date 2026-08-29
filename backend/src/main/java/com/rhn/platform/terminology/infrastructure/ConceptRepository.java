package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.Concept;
import com.rhn.platform.terminology.domain.TerminologyStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface ConceptRepository extends JpaRepository<Concept, Long> {
    Optional<Concept> findByCodeSystemIdAndCode(Long codeSystemId, String code);
    List<Concept> findByCodeSystemIdAndStatusAndEffectiveFromLessThanEqualOrderByCode(
            Long codeSystemId, TerminologyStatus status, LocalDate atDate);
    List<Concept> findByCodeSystemIdInOrderByDisplay(Collection<Long> codeSystemIds);
}
