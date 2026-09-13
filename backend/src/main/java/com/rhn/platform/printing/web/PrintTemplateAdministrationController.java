package com.rhn.platform.printing.web;

import com.rhn.platform.printing.application.PrintTemplateAdministrationService;
import com.rhn.platform.printing.application.PrintTemplateAdministrationService.CatalogView;
import com.rhn.platform.printing.application.PrintTemplateAdministrationService.DraftView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/platform/printing/administration")
@PreAuthorize("hasAnyAuthority('CONFIGURATION.ACCESS','ROLE_ADMIN')")
public class PrintTemplateAdministrationController {
    private final PrintTemplateAdministrationService service;

    public PrintTemplateAdministrationController(PrintTemplateAdministrationService service) { this.service = service; }

    @GetMapping("/catalog")
    CatalogView catalog() { return service.catalog(); }

    @GetMapping("/drafts")
    List<DraftView> drafts() { return service.drafts(); }

    @PostMapping("/drafts")
    DraftView create(@Valid @RequestBody SaveDraftRequest request) {
        return service.create(request.documentDefinitionId(), request.mediaProfileId(), request.templateCode(),
                request.templateName(), request.layoutSchema(), request.configJson());
    }

    @PutMapping("/drafts/{draftId}")
    DraftView update(@PathVariable Long draftId, @Valid @RequestBody UpdateDraftRequest request) {
        return service.update(draftId, request.expectedRevision(), request.documentDefinitionId(),
                request.mediaProfileId(), request.templateName(), request.layoutSchema(), request.configJson());
    }

    @PostMapping("/drafts/{draftId}/submit")
    DraftView submit(@PathVariable Long draftId, @Valid @RequestBody RevisionRequest request) {
        return service.submit(draftId, request.expectedRevision());
    }

    @PostMapping("/drafts/{draftId}/reject")
    DraftView reject(@PathVariable Long draftId, @Valid @RequestBody RevisionRequest request) {
        return service.reject(draftId, request.expectedRevision());
    }

    @PostMapping("/drafts/{draftId}/publish")
    DraftView publish(@PathVariable Long draftId, @Valid @RequestBody RevisionRequest request) {
        return service.publish(draftId, request.expectedRevision());
    }

    @PostMapping("/templates/{templateId}/drafts")
    DraftView clonePublished(@PathVariable Long templateId) { return service.clonePublished(templateId); }

    @PostMapping("/drafts/{draftId}/preview")
    ResponseEntity<byte[]> preview(@PathVariable Long draftId, @RequestBody(required = false) PreviewRequest request) {
        byte[] pdf = service.preview(draftId, request == null ? Map.of() : request.sampleData());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename("template-preview.pdf", StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.APPLICATION_PDF).contentLength(pdf.length).body(pdf);
    }

    public record SaveDraftRequest(@NotNull Long documentDefinitionId, @NotNull Long mediaProfileId,
            @NotBlank @Size(max = 100) String templateCode, @NotBlank @Size(max = 200) String templateName,
            @NotBlank @Size(max = 80) String layoutSchema, @NotBlank @Size(max = 200000) String configJson) {}
    public record UpdateDraftRequest(@Min(0) long expectedRevision, @NotNull Long documentDefinitionId,
            @NotNull Long mediaProfileId, @NotBlank @Size(max = 200) String templateName,
            @NotBlank @Size(max = 80) String layoutSchema, @NotBlank @Size(max = 200000) String configJson) {}
    public record RevisionRequest(@Min(0) long expectedRevision) {}
    public record PreviewRequest(Map<String, Object> sampleData) {}
}
