package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.RegistrationBillingIntent;
import com.rhn.billing.domain.RegistrationBillingIntentStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.Collection;

public interface RegistrationBillingIntentRepository extends JpaRepository<RegistrationBillingIntent, Long> {
    boolean existsByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
            Long tenantId, Long residentId, Long organizationId, Long departmentId, Collection<RegistrationBillingIntentStatus> statuses);
    java.util.List<RegistrationBillingIntent> findByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
            Long tenantId, Long residentId, Long organizationId, Long departmentId, Collection<RegistrationBillingIntentStatus> statuses);
    Optional<RegistrationBillingIntent> findByIdAndTenantId(Long id, Long tenantId);
    Optional<RegistrationBillingIntent> findByTenantIdAndIdempotencyCode(Long tenantId, String idempotencyCode);
    Optional<RegistrationBillingIntent> findByTenantIdAndSettlementId(Long tenantId, Long settlementId);
    Optional<RegistrationBillingIntent> findByTenantIdAndPaymentOrderId(Long tenantId, Long paymentOrderId);
    Optional<RegistrationBillingIntent> findByTenantIdAndEncounterId(Long tenantId, Long encounterId);
    java.util.List<RegistrationBillingIntent> findByTenantIdAndEncounterIdIn(Long tenantId, Collection<Long> encounterIds);
    Optional<RegistrationBillingIntent> findFirstByTenantIdAndAppointmentIdAndStatusIn(
            Long tenantId, Long appointmentId, Collection<RegistrationBillingIntentStatus> statuses);

    // 只返回 ID：若候选实体先被载入持久化上下文，后续加悲观锁不会刷新其内存状态，会基于旧状态/旧版本号处理。
    @Query("select value.id from RegistrationBillingIntent value where value.tenantId = :tenantId"
            + " and value.residentId = :residentId and value.organizationId = :organizationId"
            + " and value.departmentId = :departmentId and value.status = :status and value.expiresAt < :before")
    java.util.List<Long> findStalePaymentPendingIdsForResident(@Param("tenantId") Long tenantId,
            @Param("residentId") Long residentId, @Param("organizationId") Long organizationId,
            @Param("departmentId") Long departmentId, @Param("status") RegistrationBillingIntentStatus status,
            @Param("before") java.time.Instant before);

    @Query("select value.id from RegistrationBillingIntent value where value.tenantId = :tenantId"
            + " and value.appointmentId = :appointmentId and value.status = :status and value.expiresAt < :before")
    java.util.List<Long> findStalePaymentPendingIdsForAppointment(@Param("tenantId") Long tenantId,
            @Param("appointmentId") Long appointmentId, @Param("status") RegistrationBillingIntentStatus status,
            @Param("before") java.time.Instant before);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from RegistrationBillingIntent value where value.id = :id and value.tenantId = :tenantId")
    Optional<RegistrationBillingIntent> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from RegistrationBillingIntent value where value.encounterId = :encounterId and value.tenantId = :tenantId")
    Optional<RegistrationBillingIntent> lockByTenantIdAndEncounterId(
            @Param("tenantId") Long tenantId, @Param("encounterId") Long encounterId);
}
