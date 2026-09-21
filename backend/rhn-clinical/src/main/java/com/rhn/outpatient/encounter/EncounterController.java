package com.rhn.outpatient.encounter;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/encounters")
public class EncounterController {
    private final EncounterService encounterService;

    public EncounterController(EncounterService encounterService) {
        this.encounterService = encounterService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    EncounterResponse register(@Valid @RequestBody RegisterEncounterRequest request) {
        return encounterService.register(request);
    }

    @PostMapping("/{encounterId}/start")
    EncounterResponse start(@PathVariable Long encounterId,
                            @Valid @RequestBody StartEncounterRequest request) {
        return encounterService.start(encounterId, request);
    }

    @PostMapping("/{encounterId}/suspend")
    EncounterResponse suspend(@PathVariable Long encounterId,
                              @Valid @RequestBody SuspendEncounterRequest request) {
        return encounterService.suspend(encounterId, request);
    }

    @PostMapping("/{encounterId}/resume")
    EncounterResponse resume(@PathVariable Long encounterId,
                             @Valid @RequestBody ResumeEncounterRequest request) {
        return encounterService.resume(encounterId, request);
    }

    @PutMapping("/{encounterId}/clinical-record")
    EncounterResponse record(@PathVariable Long encounterId,
                             @Valid @RequestBody RecordClinicalDataRequest request) {
        return encounterService.recordClinicalData(encounterId, request);
    }

    @PostMapping("/{encounterId}/complete")
    EncounterResponse complete(@PathVariable Long encounterId,
                               @Valid @RequestBody(required = false) CompleteEncounterRequest request) {
        return encounterService.complete(encounterId, request == null ? CompleteEncounterRequest.defaultRequest() : request);
    }

    @GetMapping("/{encounterId}")
    EncounterResponse get(@PathVariable Long encounterId) {
        return encounterService.get(encounterId);
    }

    @GetMapping
    List<EncounterResponse> byResident(@RequestParam Long residentId) {
        return encounterService.byResident(residentId);
    }

    @GetMapping("/{encounterId}/orderable-medications")
    List<com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.OrderableMedicationView> orderableMedications(
            @PathVariable Long encounterId,
            @RequestParam(required = false) String query) {
        return encounterService.searchOrderableMedications(encounterId, query);
    }

    @GetMapping("/page")
    @org.springframework.security.access.prepost.PreAuthorize(
            "hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','OUTPATIENT_REGISTRATION.ACCESS','ROLE_ADMIN')")
    EncounterPageView page(@RequestParam(required = false) java.time.LocalDate dateFrom,
                           @RequestParam(required = false) java.time.LocalDate dateTo,
                           @RequestParam(required = false) String status,
                           @RequestParam(required = false) String query,
                           @RequestParam(defaultValue = "0") int page,
                           @RequestParam(defaultValue = "20") int size,
                           @RequestParam(defaultValue = "DEPARTMENT") String scope) {
        return encounterService.page(dateFrom, dateTo, status, query, page, size,
                "ORGANIZATION".equalsIgnoreCase(scope));
    }
}
