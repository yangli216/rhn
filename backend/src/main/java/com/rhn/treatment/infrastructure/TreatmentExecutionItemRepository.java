package com.rhn.treatment.infrastructure;

import com.rhn.treatment.domain.TreatmentExecutionItem;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface TreatmentExecutionItemRepository extends JpaRepository<TreatmentExecutionItem, Long> {
    Optional<TreatmentExecutionItem> findByTenantIdAndSourceTypeAndSourceId(
            Long tenantId, String sourceType, Long sourceId);
    List<TreatmentExecutionItem> findByTenantIdAndTaskIdOrderByCreatedAtAscIdAsc(Long tenantId, Long taskId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from TreatmentExecutionItem i where i.tenantId=:tenantId "
            + "and i.sourceType=:sourceType and i.sourceId=:sourceId")
    Optional<TreatmentExecutionItem> lockBySource(Long tenantId, String sourceType, Long sourceId);
}
