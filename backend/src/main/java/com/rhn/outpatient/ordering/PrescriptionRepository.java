package com.rhn.outpatient.ordering;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface PrescriptionRepository extends JpaRepository<Prescription, Long> {
    Optional<Prescription> findByIdAndTenantId(Long id, Long tenantId);
    List<Prescription> findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(Long tenantId, Long encounterId);
}
