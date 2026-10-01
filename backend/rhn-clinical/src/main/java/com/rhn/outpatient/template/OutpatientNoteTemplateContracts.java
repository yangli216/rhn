package com.rhn.outpatient.template;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class OutpatientNoteTemplateContracts {
    private OutpatientNoteTemplateContracts() {}

    public record SaveRequest(
            @NotBlank @Size(max = 16) String scopeType,
            @NotBlank @Size(max = 100) String name,
            @Size(max = 500) String description,
            @Size(max = 64) String specialtyCode,
            Integer sortOrder,
            @NotNull @Valid NoteContent content) {}

    public record NoteContent(
            @Size(max = 1000) String chiefComplaint,
            @Size(max = 4000) String presentIllness,
            @Size(max = 4000) String medicalHistory,
            @Size(max = 4000) String physicalExam,
            @Size(max = 4000) String treatmentPlan,
            @Size(max = 4000) String allergyHistory,
            @Size(max = 4000) String medicationHistory,
            @Size(max = 4000) String auxiliaryExaminations,
            @Size(max = 4000) String healthEducation,
            @Size(max = 4000) String followUp) {
        public NoteContent(String chiefComplaint, String presentIllness, String medicalHistory,
                           String physicalExam, String treatmentPlan) {
            this(chiefComplaint, presentIllness, medicalHistory, physicalExam, treatmentPlan,
                    null, null, null, null, null);
        }
    }

    public record RevisionRequest(@NotNull Long expectedRevision) {}

    public record UpdateRequest(
            @NotNull Long expectedRevision,
            @NotBlank @Size(max = 16) String scopeType,
            @NotBlank @Size(max = 100) String name,
            @Size(max = 500) String description,
            @Size(max = 64) String specialtyCode,
            Integer sortOrder,
            @NotNull @Valid NoteContent content) {}

    public record View(
            Long id, long revision, String scopeType, String name, String description,
            String specialtyCode, String documentType, String contentSchema, NoteContent content,
            String status, int sortOrder, long useCount, Instant lastUsedAt,
            Instant createdAt, Instant updatedAt) {}
}
