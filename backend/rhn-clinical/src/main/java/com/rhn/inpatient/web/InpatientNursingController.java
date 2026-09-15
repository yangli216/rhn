package com.rhn.inpatient.web;

import com.rhn.inpatient.api.InpatientNursingViews.NursingContent;
import com.rhn.inpatient.api.InpatientNursingViews.NursingAssessment;
import com.rhn.inpatient.api.InpatientNursingViews.NursingRecordView;
import com.rhn.inpatient.api.InpatientNursingViews.ObservationSummary;
import com.rhn.inpatient.api.InpatientNursingViews.ShiftHandoffView;
import com.rhn.inpatient.api.InpatientPermissions;
import com.rhn.inpatient.application.InpatientNursingService;
import com.rhn.inpatient.application.InpatientNursingService.HandoffCommand;
import com.rhn.inpatient.application.InpatientNursingService.HandoffPatientCommand;
import com.rhn.inpatient.application.InpatientNursingService.NursingRecordCommand;
import com.rhn.inpatient.application.InpatientNursingService.SignatureCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
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
public class InpatientNursingController {
    private final InpatientNursingService service;

    public InpatientNursingController(InpatientNursingService service) {
        this.service = service;
    }

    @PostMapping("/episodes/{episodeId}/nursing-records")
    @ResponseStatus(HttpStatus.CREATED)
    NursingRecordView appendNursingRecord(
            @PathVariable Long episodeId, @Valid @RequestBody NursingRecordRequest input) {
        return service.appendNursingRecord(episodeId, new NursingRecordCommand(
                input.occurredAt(), input.recordType(), input.content(),
                input.observationSummary(), input.assessment(), input.commandCode()));
    }

    @GetMapping("/episodes/{episodeId}/nursing-records")
    List<NursingRecordView> nursingRecords(
            @PathVariable Long episodeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return service.nursingRecords(episodeId, from, to);
    }

    @PostMapping("/shift-handoffs")
    @ResponseStatus(HttpStatus.CREATED)
    ShiftHandoffView createHandoff(@Valid @RequestBody HandoffRequest input) {
        List<HandoffPatientCommand> patients = input.patients() == null ? List.of()
                : input.patients().stream().map(value -> new HandoffPatientCommand(
                        value.episodeId(), value.situation(), value.pendingActions(), value.riskFlags())).toList();
        return service.createHandoff(new HandoffCommand(
                input.from(), input.to(), input.wardSummary(), input.generalItems(),
                patients, input.commandCode()));
    }

    @GetMapping("/shift-handoffs")
    List<ShiftHandoffView> handoffs(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) String status) {
        return service.handoffs(from, to, status);
    }

    @GetMapping("/shift-handoffs/{handoffId}")
    ShiftHandoffView handoff(@PathVariable Long handoffId) {
        return service.handoff(handoffId);
    }

    @PostMapping("/shift-handoffs/{handoffId}/submit")
    ShiftHandoffView submit(
            @PathVariable Long handoffId, @Valid @RequestBody SignatureRequest input) {
        return service.submitHandoff(handoffId, new SignatureCommand(input.commandCode()));
    }

    @PostMapping("/shift-handoffs/{handoffId}/accept")
    ShiftHandoffView accept(
            @PathVariable Long handoffId, @Valid @RequestBody SignatureRequest input) {
        return service.acceptHandoff(handoffId, new SignatureCommand(input.commandCode()));
    }

    public record NursingRecordRequest(
            @NotNull Instant occurredAt,
            @NotBlank @Size(max = 32) String recordType,
            NursingContent content,
            ObservationSummary observationSummary,
            NursingAssessment assessment,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record HandoffPatientRequest(
            @NotNull Long episodeId,
            @NotBlank @Size(max = 2000) String situation,
            @Size(max = 50) List<@NotBlank @Size(max = 500) String> pendingActions,
            @Size(max = 20) List<@NotBlank @Size(max = 100) String> riskFlags) {
    }

    public record HandoffRequest(
            @NotNull Instant from,
            @NotNull Instant to,
            @NotBlank @Size(max = 2000) String wardSummary,
            @Size(max = 100) List<@NotBlank @Size(max = 500) String> generalItems,
            @Size(max = 500) List<@Valid HandoffPatientRequest> patients,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record SignatureRequest(@NotBlank @Size(max = 128) String commandCode) {
    }
}
