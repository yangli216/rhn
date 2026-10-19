package com.rhn.platform.cryptography.infrastructure;

import com.rhn.platform.cryptography.domain.SigningOrder;
import com.rhn.platform.cryptography.domain.SigningOrderStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SigningOrderRepository extends JpaRepository<SigningOrder, Long> {
    Optional<SigningOrder> findByIdAndTenantId(Long id, Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from SigningOrder o where o.id = :id")
    Optional<SigningOrder> findLocked(@Param("id") Long id);

    List<SigningOrder> findByTenantIdAndAttestationEvidenceIdInOrderByCreatedAtDescIdDesc(
            Long tenantId, Collection<Long> attestationEvidenceIds);

    List<SigningOrder> findByTenantIdAndUserIdAndStatusInOrderByCreatedAtDescIdDesc(
            Long tenantId, Long userId, Collection<SigningOrderStatus> statuses, Pageable page);

    Optional<SigningOrder> findByVendorCodeAndExternalOrderId(String vendorCode, String externalOrderId);

    @Query("""
            select o.id from SigningOrder o
             where o.status in :statuses and o.nextCheckAt <= :now
             order by o.nextCheckAt, o.id
            """)
    List<Long> findDue(@Param("statuses") Collection<SigningOrderStatus> statuses, @Param("now") Instant now,
                       Pageable page);
}
