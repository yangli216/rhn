package com.rhn.healthcore.mpi;

import java.math.BigDecimal;
import java.util.List;

public record SourceRecordResponse(
        Long id,
        Long sourceOrganizationId,
        String sourceSystem,
        String sourceRecordId,
        Long residentId,
        String matchStatus,
        List<CandidateView> candidates
) {
    static SourceRecordResponse from(ResidentSourceRecord record, List<ResidentMatchCandidate> candidates) {
        return new SourceRecordResponse(record.id(), record.sourceOrganizationId(), record.sourceSystem(),
                record.sourceRecordId(), record.residentId(), record.matchStatus().name(), candidates.stream()
                .map(candidate -> new CandidateView(candidate.id(), candidate.candidateResidentId(),
                        candidate.matchScore(), candidate.reasonsJson(), candidate.decision()))
                .toList());
    }

    public record CandidateView(Long id, Long residentId, BigDecimal score, String reasonsJson, String decision) {}
}
