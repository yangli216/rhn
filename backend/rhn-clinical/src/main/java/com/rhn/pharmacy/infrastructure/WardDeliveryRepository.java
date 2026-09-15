package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.WardDelivery;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface WardDeliveryRepository extends JpaRepository<WardDelivery, Long> {
    Optional<WardDelivery> findByTenantIdAndDeliveryNo(Long tenantId, String deliveryNo);
    Optional<WardDelivery> findByIdAndTenantId(Long id, Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from WardDelivery d where d.id = :id and d.tenantId = :tenantId")
    Optional<WardDelivery> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    List<WardDelivery> findByTenantIdAndOrganizationIdOrderByCreatedAtDesc(
            Long tenantId, Long organizationId);

    List<WardDelivery> findByTenantIdAndOrganizationIdAndStatusInOrderByCreatedAtDesc(
            Long tenantId, Long organizationId, Collection<String> statuses);
}
