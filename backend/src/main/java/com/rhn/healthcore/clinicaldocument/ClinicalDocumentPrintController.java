package com.rhn.healthcore.clinicaldocument;

import com.rhn.platform.printing.api.PrintReceipt;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/clinical-documents/{documentId}/print-jobs")
class ClinicalDocumentPrintController {
    private final ClinicalDocumentPrintService service;

    ClinicalDocumentPrintController(ClinicalDocumentPrintService service) { this.service = service; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    PrintReceipt print(@PathVariable Long documentId, @Valid @RequestBody PrintRequest request) {
        return service.print(documentId, new ClinicalDocumentPrintService.PrintAction(request.purpose(), request.copies()));
    }

    record PrintRequest(
            @NotBlank @Pattern(regexp = "CLINICAL_USE|PATIENT_COPY|ARCHIVE_COPY") String purpose,
            @Min(1) @Max(10) int copies) {}
}
