package com.rhn.inpatient.web;

import com.rhn.inpatient.api.InpatientPermissions;
import com.rhn.inpatient.api.InpatientViews.BedView;
import com.rhn.inpatient.api.InpatientViews.BootstrapView;
import com.rhn.inpatient.api.InpatientViews.EpisodeView;
import com.rhn.inpatient.api.InpatientViews.DischargeReadinessView;
import com.rhn.inpatient.api.InpatientViews.DischargeDiagnosisListView;
import com.rhn.inpatient.api.InpatientViews.AdmissionDiagnosisListView;
import com.rhn.inpatient.api.InpatientViews.WardBoardView;
import com.rhn.inpatient.application.InpatientApplicationService;
import com.rhn.inpatient.application.InpatientWardBoardService;
import com.rhn.inpatient.application.InpatientApplicationService.AdmissionCommand;
import com.rhn.inpatient.application.InpatientApplicationService.BedStatusCommand;
import com.rhn.inpatient.application.InpatientApplicationService.DischargeCommand;
import com.rhn.inpatient.application.InpatientApplicationService.MovementCommand;
import com.rhn.inpatient.application.InpatientApplicationService.DiagnosisCommand;
import com.rhn.inpatient.application.InpatientApplicationService.RecordDischargeDiagnosesCommand;
import com.rhn.inpatient.application.InpatientApplicationService.RecordAdmissionDiagnosesCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/inpatient")
@PreAuthorize(InpatientPermissions.ACCESS)
public class InpatientController {
    private final InpatientApplicationService service;
    private final InpatientWardBoardService wardBoard;

    public InpatientController(InpatientApplicationService service,
                               InpatientWardBoardService wardBoard) {
        this.service = service;
        this.wardBoard = wardBoard;
    }

    @GetMapping("/bootstrap")
    BootstrapView bootstrap(@RequestParam(required = false) String status,
                            @RequestParam(required = false) String keyword) {
        return service.bootstrap(status, keyword);
    }

    @GetMapping("/ward-board")
    WardBoardView wardBoard(@RequestParam(required = false) Instant from,
                            @RequestParam(required = false) Instant to) {
        return wardBoard.wardBoard(from, to);
    }

    @PostMapping("/admissions")
    @ResponseStatus(HttpStatus.CREATED)
    EpisodeView admit(@Valid @RequestBody AdmissionRequest input) {
        return service.admit(new AdmissionCommand(
                input.residentId(), input.bedId(), input.admissionTypeCode(), input.admissionSourceCode(),
                input.admissionReason(), input.nursingLevelCode(), input.dietCode(),
                input.responsibleNurseId(), input.admittedAt(), input.admissionMethodCode(), input.conditionCode(),
                input.paymentMethodCode(), input.referralOrganizationName(), input.emergencyContactName(),
                input.emergencyContactRelationship(), input.emergencyContactPhone(), input.admissionNote(),
                input.commandCode()));
    }

    @PostMapping("/episodes/{episodeId}/transfer")
    EpisodeView transfer(@PathVariable Long episodeId, @Valid @RequestBody MovementRequest input) {
        return service.transfer(episodeId,
                new MovementCommand(input.expectedRevision(), input.targetBedId(), input.reason(), input.commandCode()));
    }

    @PostMapping("/episodes/{episodeId}/discharge")
    EpisodeView discharge(@PathVariable Long episodeId, @Valid @RequestBody DischargeRequest input) {
        return service.discharge(episodeId,
                new DischargeCommand(input.expectedRevision(), input.dispositionCode(), input.note(), input.commandCode()));
    }

    @GetMapping("/episodes/{episodeId}/discharge-readiness")
    DischargeReadinessView dischargeReadiness(@PathVariable Long episodeId) {
        return service.dischargeReadiness(episodeId);
    }

    @PutMapping("/episodes/{episodeId}/admission-diagnoses")
    AdmissionDiagnosisListView recordAdmissionDiagnoses(
            @PathVariable Long episodeId, @Valid @RequestBody AdmissionDiagnosesRequest input) {
        return service.recordAdmissionDiagnoses(episodeId, new RecordAdmissionDiagnosesCommand(
                input.expectedEpisodeRevision(), input.diagnoses().stream()
                        .map(value -> new DiagnosisCommand(value.code(), value.display(), value.diagnosisType(),
                                value.verificationStatus()))
                        .toList(), input.commandCode()));
    }

    @GetMapping("/episodes/{episodeId}/admission-diagnoses")
    AdmissionDiagnosisListView admissionDiagnoses(@PathVariable Long episodeId) {
        return service.admissionDiagnoses(episodeId);
    }

    @PutMapping("/episodes/{episodeId}/discharge-diagnoses")
    DischargeDiagnosisListView recordDischargeDiagnoses(
            @PathVariable Long episodeId, @Valid @RequestBody DischargeDiagnosesRequest input) {
        return service.recordDischargeDiagnoses(episodeId, new RecordDischargeDiagnosesCommand(
                input.expectedEpisodeRevision(), input.diagnoses().stream()
                        .map(value -> new DiagnosisCommand(value.code(), value.display(), value.diagnosisType(),
                                "CONFIRMED"))
                        .toList(), input.commandCode()));
    }

    @GetMapping("/episodes/{episodeId}/discharge-diagnoses")
    DischargeDiagnosisListView dischargeDiagnoses(@PathVariable Long episodeId) {
        return service.dischargeDiagnoses(episodeId);
    }

    @PostMapping("/beds/{bedId}/status")
    BedView changeBedStatus(@PathVariable Long bedId, @Valid @RequestBody BedStatusRequest input) {
        return service.changeBedStatus(bedId,
                new BedStatusCommand(input.expectedRevision(), input.status(), input.reason(), input.commandCode()));
    }

    public record AdmissionRequest(
            @NotNull Long residentId,
            @NotNull Long bedId,
            @Pattern(regexp = "GENERAL|EMERGENCY|TRANSFER") String admissionTypeCode,
            @Pattern(regexp = "OUTPATIENT|EMERGENCY|REFERRAL|DIRECT") String admissionSourceCode,
            @Size(max = 1000) String admissionReason,
            @Pattern(regexp = "SPECIAL|LEVEL_I|LEVEL_II|LEVEL_III") String nursingLevelCode,
            @Size(max = 64) String dietCode,
            Long responsibleNurseId,
            Instant admittedAt,
            @Pattern(regexp = "WALKING|WHEELCHAIR|STRETCHER|AMBULANCE") String admissionMethodCode,
            @Pattern(regexp = "GENERAL|URGENT|CRITICAL") String conditionCode,
            @Pattern(regexp = "SELF_PAY|BASIC_MEDICAL_INSURANCE|COMMERCIAL_INSURANCE|OTHER") String paymentMethodCode,
            @Size(max = 200) String referralOrganizationName,
            @Size(max = 100) String emergencyContactName,
            @Size(max = 64) String emergencyContactRelationship,
            @Size(max = 32) String emergencyContactPhone,
            @Size(max = 1000) String admissionNote,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record MovementRequest(
            @NotNull Long expectedRevision,
            @NotNull Long targetBedId,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record DischargeRequest(
            @NotNull Long expectedRevision,
            @Pattern(regexp = "HOME|TRANSFER|DEATH|OTHER") String dispositionCode,
            @Size(max = 2000) String note,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record DischargeDiagnosesRequest(
            @NotNull Long expectedEpisodeRevision,
            @NotEmpty List<@Valid DiagnosisRequest> diagnoses,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record AdmissionDiagnosesRequest(
            @NotNull Long expectedEpisodeRevision,
            @NotEmpty List<@Valid AdmissionDiagnosisRequest> diagnoses,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record AdmissionDiagnosisRequest(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 200) String display,
            @NotBlank @Pattern(regexp = "PRIMARY|SECONDARY") String diagnosisType,
            @NotBlank @Pattern(regexp = "CONFIRMED|PROVISIONAL") String verificationStatus) {
    }

    public record DiagnosisRequest(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 200) String display,
            @NotBlank @Pattern(regexp = "PRIMARY|SECONDARY") String diagnosisType) {
    }

    public record BedStatusRequest(
            @NotNull Long expectedRevision,
            @NotBlank @Pattern(regexp = "AVAILABLE|CLEANING|BLOCKED|MAINTENANCE") String status,
            @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String commandCode) {
    }
}
