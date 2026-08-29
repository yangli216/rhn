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
@RequestMapping("/api/encounters/{encounterId}/prescriptions")
class PrescriptionController {
    private final PrescriptionService service;
    private final PrescriptionPrintService printService;

    PrescriptionController(PrescriptionService service, PrescriptionPrintService printService) {
        this.service = service; this.printService = printService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    PrescriptionResponse create(@PathVariable Long encounterId, @Valid @RequestBody CreatePrescription request) {
        return service.create(encounterId, request);
    }

    @GetMapping
    List<PrescriptionResponse> list(@PathVariable Long encounterId) { return service.list(encounterId); }

    @PostMapping("/{prescriptionId}/submit")
    PrescriptionResponse submit(@PathVariable Long encounterId, @PathVariable Long prescriptionId,
                                @Valid @RequestBody PrescriptionAction action) {
        return service.submit(encounterId, prescriptionId, action);
    }

    @PostMapping("/{prescriptionId}/cancel")
    PrescriptionResponse cancel(@PathVariable Long encounterId, @PathVariable Long prescriptionId,
                                @Valid @RequestBody PrescriptionAction action) {
        return service.cancel(encounterId, prescriptionId, action);
    }

    @PostMapping("/{prescriptionId}/print-jobs")
    @ResponseStatus(HttpStatus.CREATED)
    com.rhn.platform.printing.api.PrintReceipt print(@PathVariable Long encounterId,
                                                     @PathVariable Long prescriptionId,
                                                     @Valid @RequestBody PrintAction action) {
        return printService.print(encounterId, prescriptionId, action.purpose(), action.copies());
    }

    record PrintAction(
            @jakarta.validation.constraints.NotBlank
            @jakarta.validation.constraints.Pattern(regexp = "CLINICAL_USE|PATIENT_COPY|ARCHIVE_COPY") String purpose,
            @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(10) int copies) {}
}
