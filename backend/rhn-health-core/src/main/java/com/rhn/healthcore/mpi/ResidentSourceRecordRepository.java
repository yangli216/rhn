package com.rhn.healthcore.mpi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface ResidentSourceRecordRepository extends JpaRepository<ResidentSourceRecord, Long> {
    Optional<ResidentSourceRecord> findByTenantIdAndSourceSystemAndSourceRecordId(
            Long tenantId, String sourceSystem, String sourceRecordId);
    Optional<ResidentSourceRecord> findByIdAndTenantId(Long id, Long tenantId);
    List<ResidentSourceRecord> findByTenantIdAndResidentId(Long tenantId, Long residentId);
}
