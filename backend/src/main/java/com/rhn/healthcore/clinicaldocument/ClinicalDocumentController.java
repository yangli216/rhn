package com.rhn.healthcore.clinicaldocument;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
import tools.jackson.databind.JsonNode;

import java.util.List;

@RestController
@RequestMapping("/api/clinical-documents")
public class ClinicalDocumentController {
    private final ClinicalDocumentService service;

    public ClinicalDocumentController(ClinicalDocumentService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ClinicalDocumentResponse create(@Valid @RequestBody CreateRequest request) {
        return service.create(request.residentId(), request.encounterId(), request.organizationId(),
                request.departmentId(), request.documentType().trim(), request.title().trim(),
                request.contentSchema().trim(), request.content(), request.changeReason().trim());
    }

    @GetMapping("/{documentId}")
    ClinicalDocumentResponse get(@PathVariable Long documentId) { return service.get(documentId); }

    @GetMapping
    List<ClinicalDocumentResponse> byScope(@RequestParam(required = false) Long residentId,
                                           @RequestParam(required = false) Long encounterId) {
        if ((residentId == null) == (encounterId == null)) {
            throw com.rhn.shared.api.BusinessErrors.badRequest("CLINICAL_DOCUMENT_SCOPE_REQUIRED",
                    "residentId 与 encounterId 必须且只能提供一个");
        }
        return encounterId == null ? service.byResident(residentId) : service.byEncounter(encounterId);
    }

    @PutMapping("/{documentId}/draft")
    ClinicalDocumentResponse updateDraft(@PathVariable Long documentId,
                                         @Valid @RequestBody VersionRequest request) {
        return service.updateDraft(documentId, request.expectedCurrentVersion(), request.contentSchema().trim(),
                request.content(), request.changeReason().trim());
    }

    @PostMapping("/{documentId}/amendments")
    ClinicalDocumentResponse amend(@PathVariable Long documentId,
                                   @Valid @RequestBody VersionRequest request) {
        return service.amend(documentId, request.expectedCurrentVersion(), request.contentSchema().trim(),
                request.content(), request.changeReason().trim());
    }

    @PostMapping("/{documentId}/sign")
    ClinicalDocumentResponse sign(@PathVariable Long documentId, @Valid @RequestBody SignRequest request) {
        return service.sign(documentId, request.expectedCurrentVersion(), request.signatureMeaning().trim());
    }

    @PostMapping("/{documentId}/archive")
    ClinicalDocumentResponse archive(@PathVariable Long documentId) { return service.archive(documentId); }

    record CreateRequest(
            @NotNull Long residentId,
            Long encounterId,
            Long organizationId,
            Long departmentId,
            @NotBlank @Size(max = 100) String documentType,
            @NotBlank @Size(max = 300) String title,
            @NotBlank @Size(max = 100) String contentSchema,
            @NotNull JsonNode content,
            @NotBlank @Size(max = 500) String changeReason) {}

    record VersionRequest(
            @Min(1) int expectedCurrentVersion,
            @NotBlank @Size(max = 100) String contentSchema,
            @NotNull JsonNode content,
            @NotBlank @Size(max = 500) String changeReason) {}

    record SignRequest(@Min(1) int expectedCurrentVersion,
                       @NotBlank @Size(max = 100) String signatureMeaning) {}
}
