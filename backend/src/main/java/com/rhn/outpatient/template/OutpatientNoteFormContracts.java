package com.rhn.outpatient.template;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class OutpatientNoteFormContracts {
    private OutpatientNoteFormContracts() {}

    public record CreateRequest(
            @NotBlank @Size(max = 64) String formCode,
            @NotBlank @Size(max = 100) String name,
            @Size(max = 500) String description,
            @Size(max = 64) String specialtyCode,
            @NotEmpty @Size(max = 8) List<@Valid Section> sections) {}

    public record ReviseRequest(
            @NotNull Integer expectedVersion,
            @NotBlank @Size(max = 100) String name,
            @Size(max = 500) String description,
            @Size(max = 64) String specialtyCode,
            @NotEmpty @Size(max = 8) List<@Valid Section> sections) {}

    public record Section(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 100) String title,
            @Size(max = 300) String description,
            @NotEmpty @Size(max = 20) List<@Valid Field> fields) {}

    public record Field(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 100) String label,
            @NotBlank @Size(max = 16) String type,
            boolean required,
            @Size(max = 32) String unit,
            @Size(max = 200) String placeholder,
            Integer maxLength,
            BigDecimal minimum,
            BigDecimal maximum,
            @Size(max = 50) List<@Valid Option> options) {}

    public record Option(
            @NotBlank @Size(max = 64) String value,
            @NotBlank @Size(max = 100) String label) {}

    public record View(
            Long id, String formCode, int version, String specialtyCode, String name,
            String description, String definitionSchema, List<Section> sections,
            String status, Long publishedBy, Instant publishedAt) {}
}
