package com.rhn.queueing.infrastructure;

import com.rhn.queueing.domain.ServiceQueue;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ServiceQueueRepository extends JpaRepository<ServiceQueue, Long> {
    Optional<ServiceQueue> findByTenantIdAndCode(Long tenantId, String code);

    Optional<ServiceQueue> findByIdAndTenantId(Long id, Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select queue from ServiceQueue queue where queue.id = :id and queue.tenantId = :tenantId")
    Optional<ServiceQueue> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    List<ServiceQueue> findByTenantIdAndOrganizationIdAndDepartmentIdAndActiveTrueOrderByCode(
            Long tenantId, Long organizationId, Long departmentId);
}
