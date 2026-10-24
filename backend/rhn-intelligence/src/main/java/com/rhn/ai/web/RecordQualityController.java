package com.rhn.ai.web;

import com.rhn.ai.api.RecordQualityContracts.*;
import com.rhn.ai.application.RecordQualityDecisionService;
import com.rhn.outpatient.api.OutpatientPermissions;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/ai/clinical-assistant/encounters/{encounterId}/record-quality")
@PreAuthorize(OutpatientPermissions.ORDERING_ACCESS)
public class RecordQualityController {
    private final RecordQualityDecisionService service;
    public RecordQualityController(RecordQualityDecisionService service) { this.service=service; }
    @PostMapping public RecordQualityResult assessRecordQuality(@PathVariable Long encounterId,@Valid @RequestBody RecordQualityRequest input) {return service.assess(encounterId,input);}
    @GetMapping public RecordQualityResult latestRecordQuality(@PathVariable Long encounterId) {return service.latest(encounterId);}
    @PostMapping("/{runId}/feedback") public List<RecordQualityFeedback> recordQualityFeedback(@PathVariable Long encounterId,@PathVariable Long runId,
            @Valid @RequestBody RecordQualityFeedbackRequest input) {return service.feedback(encounterId,runId,input);}
}
