package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.OutpatientPermissions;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
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
@PreAuthorize(OutpatientPermissions.ORDERING_ACCESS)
class ServiceRequestController {
    private final ServiceRequestService service;
    private final ServiceRequestPrintService printService;

    ServiceRequestController(ServiceRequestService service, ServiceRequestPrintService printService) {
        this.service = service;
        this.printService = printService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ServiceRequestResponse create(@PathVariable Long encounterId,
                                  @Valid @RequestBody CreateServiceRequest request) {
        return service.create(encounterId, request);
    }

    @PostMapping("/document-preview")
    @io.swagger.v3.oas.annotations.Operation(operationId = "previewOutpatientServiceDocuments")
    List<ServiceDocumentPlan> previewDocuments(@PathVariable Long encounterId,
                                               @Valid @RequestBody List<@jakarta.validation.constraints.NotNull @Valid CreateServiceRequest> items) {
        return service.previewDocuments(encounterId, items);
    }

    @org.springframework.web.bind.annotation.PutMapping("/{id}/document-info")
    ServiceRequestResponse updateDocumentInfo(@PathVariable Long encounterId, @PathVariable Long id,
                                             @Valid @RequestBody UpdateOrderDocumentInfo input) {
        return service.updateDocumentInfo(encounterId, id, input);
    }

    /** 一张申请单内的多个项目共用单据信息，一次请求批量写入。 */
    @org.springframework.web.bind.annotation.PutMapping("/document-info")
    List<ServiceRequestResponse> updateDocumentInfoBatch(@PathVariable Long encounterId,
                                                         @Valid @RequestBody UpdateOrderDocumentInfoBatch input) {
        return service.updateDocumentInfoBatch(encounterId, input);
    }

    @GetMapping("/examination-sites")
    @io.swagger.v3.oas.annotations.Operation(operationId = "getOutpatientExaminationSiteOptions")
    ExaminationSiteOptionsResponse examinationSites(@PathVariable Long encounterId,
                                                    @org.springframework.web.bind.annotation.RequestParam Long catalogItemId) {
        return service.examinationSites(encounterId, catalogItemId);
    }

    @GetMapping
    List<ServiceRequestResponse> list(@PathVariable Long encounterId) {
        return service.list(encounterId);
    }

    @PostMapping("/{requestId}/withdraw-signature")
    ServiceRequestResponse withdrawSignature(@PathVariable Long encounterId, @PathVariable Long requestId,
                                             @Valid @RequestBody WithdrawSignatureRequest request) {
        return service.withdrawSignature(encounterId, requestId, request.expectedRevision());
    }

    @PostMapping("/{requestId}/cancel")
    ServiceRequestResponse cancel(@PathVariable Long encounterId, @PathVariable Long requestId,
                                  @Valid @RequestBody CancelServiceRequest request) {
        return service.cancel(encounterId, requestId, request);
    }

    @PostMapping("/{requestId}/print-jobs")
    @ResponseStatus(HttpStatus.CREATED)
    com.rhn.platform.printing.api.PrintReceipt print(@PathVariable Long encounterId,
                                                     @PathVariable Long requestId,
                                                     @Valid @RequestBody PrintAction action) {
        return printService.print(encounterId, requestId, action.purpose(), action.copies());
    }

    record PrintAction(
            @jakarta.validation.constraints.NotBlank
            @jakarta.validation.constraints.Pattern(regexp = "CLINICAL_USE|PATIENT_COPY|ARCHIVE_COPY") String purpose,
            @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(10) int copies) {}
}
