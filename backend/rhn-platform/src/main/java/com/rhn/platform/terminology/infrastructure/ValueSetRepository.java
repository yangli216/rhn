package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.TerminologyScope;
import com.rhn.platform.terminology.domain.TerminologyStatus;
import com.rhn.platform.terminology.domain.ValueSet;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface ValueSetRepository extends JpaRepository<ValueSet, Long> {
    boolean existsByScopeTypeAndScopeIdAndCode(TerminologyScope scopeType, Long scopeId, String code);

    List<ValueSet> findByScopeTypeAndScopeIdAndCodeAndStatusAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
            TerminologyScope scopeType, Long scopeId, String code, TerminologyStatus status, LocalDate atDate);
}
