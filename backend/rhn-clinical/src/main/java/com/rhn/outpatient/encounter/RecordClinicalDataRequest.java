package com.rhn.outpatient.encounter;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record RecordClinicalDataRequest(
        @Size(max = 128) String commandCode,
        @NotBlank(message = "主诉不能为空") @Size(max = 1000) String chiefComplaint,
        @Size(max = 4000) String presentIllness,
        @Size(max = 4000) String medicalHistory,
        @Size(max = 4000) String physicalExam,
        @Size(max = 4000) String treatmentPlan,
        Integer systolic,
        Integer diastolic,
        BigDecimal temperature,
        Integer pulseRate,
        Integer respiratoryRate,
        BigDecimal heightCm,
        BigDecimal weightKg,
        Integer oxygenSaturation,
        Long noteFormVersionId,
        @Size(max = 40) Map<@Size(max = 64) String, Object> structuredData,
        @NotEmpty(message = "至少录入一条诊断") List<@Valid DiagnosisInput> diagnoses,
        @Size(max = 4000) String allergyHistory,
        @Size(max = 4000) String medicationHistory,
        @Size(max = 4000) String auxiliaryExaminations,
        @Size(max = 4000) String healthEducation,
        @Size(max = 4000) String followUp,
        @Size(max = 200) List<com.rhn.outpatient.api.RecordAnnotation> annotations
) {
    public record DiagnosisInput(
            Long conceptId,
            @Pattern(regexp = "WESTERN_MEDICINE|TCM_DISEASE|TCM_SYNDROME")
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String diagnosisDomain,
            @NotBlank(message = "诊断编码不能为空") @Size(max = 64) String code,
            @NotBlank(message = "诊断名称不能为空") @Size(max = 200) String display,
            @NotNull(message = "诊断类型不能为空") EncounterDiagnosis.DiagnosisType type,
            @Size(max = 64) String diagnosisGroupId,
            @Size(max = 100) @io.swagger.v3.oas.annotations.media.Schema(nullable = true)
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) String codeSystem
    ) {
    }
}
