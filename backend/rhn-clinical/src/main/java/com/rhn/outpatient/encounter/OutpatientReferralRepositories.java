package com.rhn.outpatient.encounter;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

interface OutpatientReferralRequestRepository extends JpaRepository<OutpatientReferralRequest, Long> {
    Optional<OutpatientReferralRequest> findByIdAndTenantId(Long id, Long tenantId);
    Optional<OutpatientReferralRequest> findByTenantIdAndCreateCommandCode(Long tenantId, String createCommandCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from OutpatientReferralRequest value where value.id = :id and value.tenantId = :tenantId")
    Optional<OutpatientReferralRequest> findWithLockByIdAndTenantId(@Param("id") Long id,
                                                                    @Param("tenantId") Long tenantId);

    List<OutpatientReferralRequest> findByTenantIdAndEncounterIdOrderByRequestedAtDesc(
            Long tenantId, Long encounterId);

    List<OutpatientReferralRequest> findByTenantIdAndEncounterIdIn(
            Long tenantId, Collection<Long> encounterIds);

    List<OutpatientReferralRequest> findByTenantIdAndTargetOrganizationIdAndTargetDepartmentIdAndStatusInOrderByRequestedAtAsc(
            Long tenantId, Long targetOrganizationId, Long targetDepartmentId, Collection<ReferralStatus> statuses);

    boolean existsByTenantIdAndEncounterIdAndReferralTypeAndStatusIn(
            Long tenantId, Long encounterId, ReferralType referralType, Collection<ReferralStatus> statuses);
}

interface OutpatientReferralEventRepository extends JpaRepository<OutpatientReferralEvent, Long> {
    boolean existsByTenantIdAndReferralRequestIdAndCommandCode(Long tenantId, Long referralRequestId,
                                                                String commandCode);
}
