package com.rhn.healthcore.mpi;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    @Query("""
            SELECT r FROM Resident r
            WHERE r.tenantId = :tenantId
              AND (:status IS NULL OR r.status = :status)
              AND (:gender IS NULL OR r.gender = :gender)
              AND (:deceased IS NULL OR r.deceased = :deceased)
              AND (:query IS NULL OR :query = '' OR
                   LOWER(r.fullName) LIKE LOWER(CONCAT('%', :query, '%')) OR
                   LOWER(r.healthRecordNo) LIKE LOWER(CONCAT('%', :query, '%')) OR
                   (r.nationalId IS NOT NULL AND LOWER(r.nationalId) LIKE LOWER(CONCAT('%', :query, '%'))) OR
                   (r.phone IS NOT NULL AND LOWER(r.phone) LIKE LOWER(CONCAT('%', :query, '%'))))
            """)
    Page<Resident> findResidents(
            @Param("tenantId") Long tenantId,
            @Param("query") String query,
            @Param("gender") String gender,
            @Param("status") ResidentStatus status,
            @Param("deceased") Boolean deceased,
            Pageable pageable);
}

