package com.rhn.treatment.web;

import com.rhn.treatment.api.TreatmentExecutionTaskView;
import com.rhn.treatment.application.TreatmentExecutionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/treatments")
@PreAuthorize(com.rhn.treatment.api.TreatmentPermissions.ACCESS)
public class TreatmentExecutionController {
    private final TreatmentExecutionService service;

    public TreatmentExecutionController(TreatmentExecutionService service) { this.service = service; }

    @GetMapping("/worklist")
    List<TreatmentExecutionTaskView> worklist(@RequestParam(required = false) String taskType,
                                              @RequestParam(required = false) String status,
                                              @RequestParam(required = false) String keyword) {
        return service.worklist(taskType, status, keyword);
    }

    @PostMapping("/tasks/{taskId}/start")
    TreatmentExecutionTaskView start(@PathVariable Long taskId, @Valid @RequestBody StartRequest input) {
        return service.start(taskId, input.expectedRevision(), Boolean.TRUE.equals(input.identityVerified()),
                input.verificationMethod(), input.executionSite(), input.note());
    }

    @PostMapping("/tasks/{taskId}/complete")
    TreatmentExecutionTaskView complete(@PathVariable Long taskId, @Valid @RequestBody CompleteRequest input) {
        return service.complete(taskId, input.expectedRevision(), input.resultCode(), input.note(),
                Boolean.TRUE.equals(input.adverseReaction()), input.adverseReactionDetail());
    }

    record StartRequest(@NotNull Long expectedRevision, @NotNull Boolean identityVerified,
                        @Pattern(regexp = "NAME_AND_IDENTIFIER|CARD|MANUAL") String verificationMethod,
                        @Size(max = 128) String executionSite, @Size(max = 1000) String note) {}

    record CompleteRequest(@NotNull Long expectedRevision,
                           @Pattern(regexp = "COMPLETED|INTERRUPTED|NOT_COMPLETED") String resultCode,
                           @Size(max = 2000) String note, Boolean adverseReaction,
                           @Size(max = 2000) String adverseReactionDetail) {}
}
