package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintDelivery;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PrintDeliveryRepository extends JpaRepository<PrintDelivery, Long> {
    Optional<PrintDelivery> findByTenantIdAndBatchId(Long tenantId, Long batchId);
    Optional<PrintDelivery> findByTenantIdAndJobId(Long tenantId, Long jobId);
    List<PrintDelivery> findTop20ByTenantIdAndChannelAndStatusOrderByUpdatedAt(
            Long tenantId, String channel, String status);
    List<PrintDelivery> findTop20ByTenantIdAndDeviceIdAndChannelAndStatusOrderByUpdatedAt(
            Long tenantId, Long deviceId, String channel, String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from PrintDelivery d where d.id=:id and d.tenantId=:tenantId")
    Optional<PrintDelivery> lockByIdAndTenantId(Long id, Long tenantId);
}
