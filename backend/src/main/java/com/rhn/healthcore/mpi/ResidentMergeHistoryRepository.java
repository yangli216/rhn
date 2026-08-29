package com.rhn.healthcore.mpi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

interface ResidentMergeHistoryRepository extends JpaRepository<ResidentMergeHistory, Long> {
    Optional<ResidentMergeHistory> findByIdAndTenantId(Long id, Long tenantId);
}
