package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InpatientMedicationSupplyTask;
import com.rhn.pharmacy.domain.InpatientMedicationSupplyTaskStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface InpatientMedicationSupplyTaskRepository
        extends JpaRepository<InpatientMedicationSupplyTask, Long> {
    List<InpatientMedicationSupplyTask> findByTenantIdAndSupplyLineIdOrderByScheduledAt(
            Long tenantId, Long supplyLineId);
    Optional<InpatientMedicationSupplyTask> findByTenantIdAndOrderTaskIdAndStatus(
            Long tenantId, Long orderTaskId, InpatientMedicationSupplyTaskStatus status);
    List<InpatientMedicationSupplyTask> findByTenantIdAndRequestIdAndStatusOrderByScheduledAt(
            Long tenantId, Long requestId, InpatientMedicationSupplyTaskStatus status);
    boolean existsByTenantIdAndOrderTaskIdAndStatus(Long tenantId, Long orderTaskId,
                                                    InpatientMedicationSupplyTaskStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientMedicationSupplyTask value "
            + "where value.tenantId = :tenantId and value.supplyLineId = :lineId "
            + "and value.status = com.rhn.pharmacy.domain.InpatientMedicationSupplyTaskStatus.ACTIVE "
            + "order by value.scheduledAt, value.id")
    List<InpatientMedicationSupplyTask> findActiveLockedByLine(
            @Param("tenantId") Long tenantId, @Param("lineId") Long lineId);
}
