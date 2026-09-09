package com.rhn.ai.infrastructure;

import com.rhn.ai.domain.AiSuggestion;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AiSuggestionRepository extends JpaRepository<AiSuggestion, Long> {
    List<AiSuggestion> findTop50ByTenantIdAndEncounterIdOrderByGeneratedAtDescIdDesc(Long tenantId, Long encounterId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from AiSuggestion value where value.id = :id and value.tenantId = :tenantId")
    Optional<AiSuggestion> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
