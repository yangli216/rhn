package com.rhn.outpatient.encounter;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record RecordClinicalDataRequest(
        @NotBlank(message = "主诉不能为空") @Size(max = 1000) String chiefComplaint,
        @NotNull(message = "收缩压不能为空") @Min(40) @Max(300) Integer systolic,
        @NotNull(message = "舒张压不能为空") @Min(20) @Max(200) Integer diastolic,
        @NotEmpty(message = "至少录入一条诊断") List<@Valid DiagnosisInput> diagnoses
) {
    public record DiagnosisInput(
            @NotBlank(message = "诊断编码不能为空") @Size(max = 64) String code,
            @NotBlank(message = "诊断名称不能为空") @Size(max = 200) String display,
            @NotNull(message = "诊断类型不能为空") EncounterDiagnosis.DiagnosisType type
    ) {
    }
}

