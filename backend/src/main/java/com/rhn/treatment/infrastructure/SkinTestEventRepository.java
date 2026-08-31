package com.rhn.treatment.infrastructure;

import com.rhn.treatment.domain.SkinTestEvent;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SkinTestEventRepository extends JpaRepository<SkinTestEvent, Long> {
    List<SkinTestEvent> findByTenantIdAndMedicationRequestIdInOrderByStartedAtDesc(
            Long tenantId, Collection<Long> medicationRequestIds);

    List<SkinTestEvent> findByTenantIdAndMedicationRequestIdOrderByAttemptNoDesc(
            Long tenantId, Long medicationRequestId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from SkinTestEvent e where e.id=:id and e.tenantId=:tenantId")
    Optional<SkinTestEvent> lockByIdAndTenantId(Long id, Long tenantId);
}
