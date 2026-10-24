package com.rhn.coordination.web;

import com.rhn.coordination.api.OutpatientCancellationViews.CancelEncounterRequest;
import com.rhn.coordination.api.OutpatientCancellationViews.CancelEncounterResponse;
import com.rhn.coordination.application.OutpatientCancellationService;
import com.rhn.outpatient.api.OutpatientPermissions;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/encounters")
@PreAuthorize(OutpatientPermissions.ENCOUNTER_ACCESS)
public class EncounterCancellationController {
    private final OutpatientCancellationService service;

    public EncounterCancellationController(OutpatientCancellationService service) {
        this.service = service;
    }

    @PostMapping("/{encounterId}/cancel")
    CancelEncounterResponse cancel(@PathVariable Long encounterId,
                                   @Valid @RequestBody CancelEncounterRequest request) {
        return service.cancel(encounterId, request);
    }
}
