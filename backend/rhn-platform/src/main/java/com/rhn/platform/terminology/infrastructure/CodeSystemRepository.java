package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.CodeSystem;
import com.rhn.platform.terminology.domain.TerminologyScope;
import com.rhn.platform.terminology.domain.TerminologyStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface CodeSystemRepository extends JpaRepository<CodeSystem, Long> {
    Optional<CodeSystem> findByIdAndStatus(Long id, TerminologyStatus status);
    List<CodeSystem> findByScopeTypeAndScopeIdAndCodeAndStatusAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
            TerminologyScope scopeType, Long scopeId, String code, TerminologyStatus status, LocalDate atDate);
}

