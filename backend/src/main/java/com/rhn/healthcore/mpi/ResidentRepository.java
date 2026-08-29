package com.rhn.healthcore.mpi;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

interface ResidentRepository extends JpaRepository<Resident, Long> {
    Optional<Resident> findByTenantIdAndNationalId(Long tenantId, String nationalId);
    Optional<Resident> findByIdAndTenantId(Long id, Long tenantId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Resident> findForUpdateByIdAndTenantId(Long id, Long tenantId);
    List<Resident> findByTenantIdAndStatusAndFullNameContainingIgnoreCase(
            Long tenantId, ResidentStatus status, String fullName, Pageable pageable);
    List<Resident> findTop10ByTenantIdAndStatusAndFullNameIgnoreCaseAndBirthDate(
            Long tenantId, ResidentStatus status, String fullName, java.time.LocalDate birthDate);
}
