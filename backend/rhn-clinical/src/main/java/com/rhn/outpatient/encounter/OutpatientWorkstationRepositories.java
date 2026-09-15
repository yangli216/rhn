package com.rhn.outpatient.encounter;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

interface EncounterIdentityCheckRepository extends JpaRepository<EncounterIdentityCheck, Long> {
    boolean existsByTenantIdAndEncounterIdAndResult(Long tenantId, Long encounterId, String result);
}

interface EncounterStatusEventRepository extends JpaRepository<EncounterStatusEvent, Long> {
}

interface EncounterWorkSessionRepository extends JpaRepository<EncounterWorkSession, Long> {
    Optional<EncounterWorkSession> findFirstByTenantIdAndEncounterIdAndStatusOrderByStartedAtDesc(
            Long tenantId, Long encounterId, String status);
}

interface EncounterDiagnosisRevisionRepository extends JpaRepository<EncounterDiagnosisRevision, Long> {
}

interface EncounterCompletionCheckRepository extends JpaRepository<EncounterCompletionCheck, Long> {
}

interface EncounterCompletionIssueRepository extends JpaRepository<EncounterCompletionIssue, Long> {
}
