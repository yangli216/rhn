package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/encounters/{encounterId}/medication-requests")
class MedicationRequestController {
    private final MedicationRequestService service;

    MedicationRequestController(MedicationRequestService service) { this.service = service; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    MedicationRequestResponse create(@PathVariable Long encounterId,
                                     @Valid @RequestBody CreateMedicationRequest request) {
        return service.create(encounterId, request);
    }

    @GetMapping
    List<MedicationRequestResponse> list(@PathVariable Long encounterId) { return service.list(encounterId); }

    @PostMapping("/{requestId}/cancel")
    MedicationRequestResponse cancel(@PathVariable Long encounterId, @PathVariable Long requestId,
                                     @Valid @RequestBody CancelServiceRequest request) {
        return service.cancel(encounterId, requestId, request);
    }
}
