package com.rhn.diagnostics.web;

import com.rhn.diagnostics.api.DiagnosticPermissions;
import com.rhn.diagnostics.application.DiagnosticImageService;
import com.rhn.diagnostics.application.DiagnosticImageService.ImageContent;
import com.rhn.diagnostics.api.DiagnosticImageView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@RestController
@RequestMapping("/api/diagnostics")
public class DiagnosticImageController {
    private final DiagnosticImageService service;
    public DiagnosticImageController(DiagnosticImageService service) { this.service = service; }

    @GetMapping("/tasks/{taskId}/images")
    @PreAuthorize(DiagnosticPermissions.ACCESS)
    List<DiagnosticImageView> images(@PathVariable Long taskId) { return service.draftImages(taskId); }

    @PostMapping(value = "/tasks/{taskId}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize(DiagnosticPermissions.ACCESS)
    DiagnosticImageView upload(@PathVariable Long taskId, @RequestParam long expectedRevision,
                     @RequestParam long expectedDraftRevision, @RequestParam @NotBlank @Size(max = 64) String commandId,
                     @RequestParam(required = false) @Size(max = 500) String caption,
                     @RequestParam MultipartFile file) throws IOException {
        if (file.getSize() > DiagnosticImageService.MAX_BYTES)
            throw badRequest("DIAGNOSTIC_IMAGE_SIZE_INVALID", "单张关键图像不能超过 10MB");
        return service.upload(taskId, expectedRevision, expectedDraftRevision, commandId, caption, file.getBytes());
    }

    @DeleteMapping("/tasks/{taskId}/images/{imageId}")
    @PreAuthorize(DiagnosticPermissions.ACCESS)
    ResponseEntity<Void> remove(@PathVariable Long taskId, @PathVariable Long imageId,
                               @Valid @RequestBody RevisionRequest input) {
        service.remove(taskId, imageId, input.expectedRevision(), input.expectedDraftRevision());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/tasks/{taskId}/images/{imageId}/content")
    @PreAuthorize(DiagnosticPermissions.ACCESS)
    ResponseEntity<byte[]> draftContent(@PathVariable Long taskId, @PathVariable Long imageId) {
        return content(service.readDraft(taskId, imageId));
    }

    @GetMapping("/reports/{reportId}/images/{imageId}/content")
    @PreAuthorize("hasAnyAuthority('DIAGNOSTICS.ACCESS','OUTPATIENT_RECEPTION.ACCESS','INPATIENT.ACCESS','ROLE_ADMIN')")
    ResponseEntity<byte[]> reportContent(@PathVariable Long reportId, @PathVariable Long imageId) {
        return content(service.readReport(reportId, imageId));
    }

    private ResponseEntity<byte[]> content(ImageContent image) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(image.mediaType())).body(image.bytes());
    }
    record RevisionRequest(@NotNull Long expectedRevision, @NotNull Long expectedDraftRevision) {}
}
