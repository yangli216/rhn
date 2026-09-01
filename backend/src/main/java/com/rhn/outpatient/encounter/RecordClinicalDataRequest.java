package com.rhn.outpatient.encounter;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
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
        @NotNull(message = "收缩压不能为空") @Min(40) @Max(300) Integer systolic,
        @NotNull(message = "舒张压不能为空") @Min(20) @Max(200) Integer diastolic,
        @DecimalMin(value = "30.0") @DecimalMax(value = "45.0") BigDecimal temperature,
        @Min(20) @Max(250) Integer pulseRate,
        @Min(5) @Max(80) Integer respiratoryRate,
        @DecimalMin(value = "30.0") @DecimalMax(value = "250.0") BigDecimal heightCm,
        @DecimalMin(value = "1.0") @DecimalMax(value = "500.0") BigDecimal weightKg,
        @Min(50) @Max(100) Integer oxygenSaturation,
        Long noteFormVersionId,
        @Size(max = 40) Map<@Size(max = 64) String, Object> structuredData,
        @NotEmpty(message = "至少录入一条诊断") List<@Valid DiagnosisInput> diagnoses
) {
    public record DiagnosisInput(
            Long conceptId,
            @Pattern(regexp = "WESTERN_MEDICINE|TCM_DISEASE|TCM_SYNDROME") String diagnosisDomain,
            @NotBlank(message = "诊断编码不能为空") @Size(max = 64) String code,
            @NotBlank(message = "诊断名称不能为空") @Size(max = 200) String display,
            @NotNull(message = "诊断类型不能为空") EncounterDiagnosis.DiagnosisType type,
            @Size(max = 64) String diagnosisGroupId
    ) {
    }
}
