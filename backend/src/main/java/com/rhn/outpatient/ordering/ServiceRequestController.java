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
@RequestMapping("/api/encounters/{encounterId}/service-requests")
class ServiceRequestController {
    private final ServiceRequestService service;

    ServiceRequestController(ServiceRequestService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ServiceRequestResponse create(@PathVariable Long encounterId,
                                  @Valid @RequestBody CreateServiceRequest request) {
        return service.create(encounterId, request);
    }

    @GetMapping
    List<ServiceRequestResponse> list(@PathVariable Long encounterId) {
        return service.list(encounterId);
    }

    @PostMapping("/{requestId}/cancel")
    ServiceRequestResponse cancel(@PathVariable Long encounterId, @PathVariable Long requestId,
                                  @Valid @RequestBody CancelServiceRequest request) {
        return service.cancel(encounterId, requestId, request);
    }
}
