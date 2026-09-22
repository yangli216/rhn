package com.rhn.quality.medication.api;

import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory.Reference;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import java.time.Instant;
import java.util.List;

/** AI suggestions remain unreviewed; quote location is not evidence of semantic validity. */
public final class MedicationKnowledgeExtractionContracts {
    private MedicationKnowledgeExtractionContracts() {}
    public record Request(Evidence evidence, String requirement) {}
    public record Field(String field, String value, String quote) {}
    public record Mention(String group, String name, String level, String specificationText, String quote) {}
    public record Output(String title, List<Field> fields, List<Mention> medications, List<String> questions, String otherConditions) {}
    public record Citation(String field, String value, String quote, int start, int end) {}
    public record CandidateMention(Mention mention, int start, int end, List<Reference> candidates) {}
    public record Result(boolean adoptable, Body suggestedBody, List<Citation> citations,
            List<CandidateMention> medications, List<String> questions, Assessment assessment) {}
    public record Run(Long id, Request input, String sourceTextHash, String model, String promptVersion,
            Long actorId, String actor, Instant createdAt, String rawOutput, boolean rawOutputTruncated, Result result) {}
    public record Summary(Long id, String title, String model, Instant createdAt, boolean adoptable) {}
}
