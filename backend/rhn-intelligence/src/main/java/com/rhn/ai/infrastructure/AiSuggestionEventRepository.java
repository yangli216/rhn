package com.rhn.ai.infrastructure;

import com.rhn.ai.domain.AiSuggestionEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AiSuggestionEventRepository extends JpaRepository<AiSuggestionEvent, Long> {
    Optional<AiSuggestionEvent> findByTenantIdAndSuggestionIdAndCommandCode(
            Long tenantId, Long suggestionId, String commandCode);
    List<AiSuggestionEvent> findByTenantIdAndSuggestionIdOrderByOccurredAtAsc(
            Long tenantId, Long suggestionId);
}
