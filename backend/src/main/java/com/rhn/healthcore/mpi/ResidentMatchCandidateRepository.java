package com.rhn.healthcore.mpi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

interface ResidentMatchCandidateRepository extends JpaRepository<ResidentMatchCandidate, Long> {
    List<ResidentMatchCandidate> findBySourceRecordIdOrderByMatchScoreDesc(Long sourceRecordId);
}
